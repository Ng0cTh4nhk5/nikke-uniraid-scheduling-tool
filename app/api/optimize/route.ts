import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { optimize } from "@/engine";
import type { EngineProfile, EngineBoss, EngineMember } from "@/engine/types";

// POST /api/optimize — Chạy ILP solver cho 1 mùa raid (admin only)
// Body: { raidId: number }
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { raidId } = body;

    if (!raidId) {
      return NextResponse.json({ error: "Thiếu raidId" }, { status: 400 });
    }

    const id = parseInt(raidId);

    // ── Load dữ liệu từ DB ──────────────────────────────────────────────
    const raid = await prisma.raid.findUnique({
      where: { id },
      include: { bossSlots: { orderBy: { slot: "asc" } } },
    });
    if (!raid) {
      return NextResponse.json({ error: "Không tìm thấy raid" }, { status: 404 });
    }
    if (raid.status === "closed") {
      return NextResponse.json({ error: "Raid đã đóng — không thể chạy optimizer" }, { status: 403 });
    }
    if (raid.bossSlots.length === 0) {
      return NextResponse.json(
        { error: "Chưa cấu hình boss cho mùa này" },
        { status: 400 }
      );
    }

    const dbProfiles = await prisma.profile.findMany({
      where: { bossSlot: { raidId: id } },
    });
    if (dbProfiles.length === 0) {
      return NextResponse.json(
        { error: "Chưa có profile nào cho mùa này" },
        { status: 400 }
      );
    }

    // Chỉ optimize cho members "regular". Finisher/cleaner không tham gia
    // optimizer — họ có lượt đánh riêng do Union Leader chỉ định thủ công.
    const dbMembers = await prisma.member.findMany({
      where: { isActive: true, role: "regular" },
    });

    // ── Generate 15 EngineBoss từ 5 BossSlots ─────────────────────────────
    const engineBosses: EngineBoss[] = [];
    // Map: "slot:level" → engineBossId
    const bossIdMap = new Map<string, number>();
    let engineBossId = 0;

    for (const bs of raid.bossSlots) {
      for (const level of [1, 2, 3] as const) {
        const hp = level === 1 ? bs.hpLevel1 : level === 2 ? bs.hpLevel2 : bs.hpLevel3;
        // M-4 fix: validate BigInt range BEFORE converting to Number
        if (hp > BigInt(Number.MAX_SAFE_INTEGER)) {
          return NextResponse.json(
            { error: `HP Boss ${bs.displayName} L${level} quá lớn (vượt MAX_SAFE_INTEGER)` },
            { status: 400 }
          );
        }
        const bId = engineBossId++;
        bossIdMap.set(`${bs.slot}:${level}`, bId);
        engineBosses.push({
          id: bId,
          level,
          slot: bs.slot,
          element: bs.element,
          hp: Number(hp),
          displayName: bs.displayName,
        });
      }
    }

    // ── Expand profiles: mỗi DB profile → 3 EngineProfile (1 per level) ──
    const engineProfiles: EngineProfile[] = [];
    // Reverse map: synthetic profile id → { originalProfileId, level }
    const reverseMap = new Map<number, { profileId: number; level: number }>();
    let epId = 0;

    // BossSlot lookup
    const bossSlotMap = new Map(raid.bossSlots.map((bs) => [bs.id, bs]));

    for (const p of dbProfiles) {
      const bs = bossSlotMap.get(p.bossSlotId);
      if (!bs) continue; // profile references non-existent bossSlot → skip

      // M-4 fix: validate damage BigInt BEFORE converting to Number
      if (p.damage > BigInt(Number.MAX_SAFE_INTEGER)) {
        console.warn(`[optimize] Skipping profile ${p.id}: damage exceeds MAX_SAFE_INTEGER`);
        continue;
      }

      const damage = Number(p.damage);
      const charIds = [p.char1Id, p.char2Id, p.char3Id, p.char4Id, p.char5Id];

      for (const level of [1, 2, 3] as const) {
        const bossId = bossIdMap.get(`${bs.slot}:${level}`);
        if (bossId === undefined) continue;

        const synId = epId++;
        reverseMap.set(synId, { profileId: p.id, level });
        engineProfiles.push({
          id: synId,
          memberId: p.memberId,
          bossId,
          charIds: [...charIds], // defensive copy
          damage,
        });
      }
    }

    const engineMembers: EngineMember[] = dbMembers.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
    }));

    // ── Chạy engine ────────────────────────────────────────────────────
    const result = await optimize({
      profiles: engineProfiles,
      bosses: engineBosses,
      members: engineMembers,
    });

    // H-4 fix: retry on unique constraint violation (race condition)
    let assignment;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const lastAssignment = await prisma.assignment.findFirst({
          where: { raidId: id },
          orderBy: { scenario: "desc" },
          select: { scenario: true },
        });
        const nextScenario = (lastAssignment?.scenario ?? 0) + 1;

        assignment = await prisma.assignment.create({
          data: {
            raidId: id,
            scenario: nextScenario,
            paramsJson: JSON.stringify({
              mode: "ilp",
              elapsedMs: result.elapsedMs,
              totalEffectiveDamage: result.totalEffectiveDamage,
              deepest: result.deepest,
              maxAccessibleLevel: result.maxAccessibleLevel,
              bossDamage: result.bossDamage.map((bd) => {
                const boss = engineBosses.find((b) => b.id === bd.bossId);
                return {
                  slot: boss?.slot,
                  level: boss?.level,
                  element: boss?.element,
                  displayName: boss?.displayName,
                  hp: bd.hp,
                  allocatedDamage: bd.allocatedDamage,
                  effectiveDamage: bd.effectiveDamage,
                  overkill: bd.overkill,
                };
              }),
            }),
            status: "draft",
            notes: result.warnings.length > 0 ? result.warnings.join("\n") : null,
          },
        });
        break; // success
      } catch (err) {
        if ((err as { code?: string }).code === "P2002" && attempt < 2) {
          console.warn(`[optimize] Scenario collision, retrying (attempt ${attempt + 1})...`);
          continue;
        }
        throw err;
      }
    }

    if (!assignment) {
      throw new Error("Không thể tạo assignment sau 3 lần thử");
    }

    // Lưu entries — reverse map synthetic IDs → real profile IDs + levels
    const entriesWithCombo = result.entries.filter((e) => e.combo !== null);
    if (entriesWithCombo.length > 0) {
      await prisma.assignmentEntry.createMany({
        data: entriesWithCombo.map((e) => {
          const p0 = reverseMap.get(e.combo!.profiles[0].id)!;
          const p1 = reverseMap.get(e.combo!.profiles[1].id)!;
          const p2 = reverseMap.get(e.combo!.profiles[2].id)!;
          return {
            assignmentId: assignment.id,
            memberId: e.memberId,
            profile1Id: p0.profileId,
            profile2Id: p1.profileId,
            profile3Id: p2.profileId,
            level1: p0.level,
            level2: p1.level,
            level3: p2.level,
            execOrder1: null,
            execOrder2: null,
            execOrder3: null,
          };
        }),
      });
    }

    // Lưu entries cho members không được phân công (để Union Leader biết ai thiếu)
    const unassignedEntries = result.entries.filter((e) => e.combo === null);
    if (unassignedEntries.length > 0) {
      await prisma.assignmentEntry.createMany({
        data: unassignedEntries.map((e) => ({
          assignmentId: assignment.id,
          memberId: e.memberId,
          notes: e.warningMsg ?? "Không có combo hợp lệ",
        })),
      });
    }

    // ── Trả response ──────────────────────────────────────────────────────
    const memberMap = new Map(dbMembers.map((m) => [m.id, m.name]));
    const bossMap = new Map(engineBosses.map((b) => [b.id, b]));

    return NextResponse.json({
      success: true,
      assignmentId: assignment.id,
      mode: "ilp",
      elapsedMs: result.elapsedMs,
      totalEffectiveDamage: result.totalEffectiveDamage,
      bossDamage: result.bossDamage,
      assignedMembers: entriesWithCombo.length,
      unassignedMembers: result.entries.filter((e) => !e.combo).length,
      warnings: result.warnings,
      entries: result.entries.map((e) => ({
        memberId: e.memberId,
        memberName: memberMap.get(e.memberId),
        assigned: !!e.combo,
        bosses: e.combo
          ? e.combo.profiles.map((p) => ({
              bossId: p.bossId,
              damage: p.damage,
              bossInfo: bossMap.get(p.bossId),
              originalProfileId: reverseMap.get(p.id)?.profileId,
              level: reverseMap.get(p.id)?.level,
            }))
          : [],
        warning: e.warningMsg,
      })),
    });
  } catch (error) {
    console.error("[POST /api/optimize]", error);
    return NextResponse.json(
      { error: (error as Error).message || "Lỗi server" },
      { status: 500 }
    );
  }
}
