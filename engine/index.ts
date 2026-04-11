import { buildCombos } from "./combo_builder";
import { ilpSolve } from "./ilp_solver";
import type {
  EngineProfile,
  EngineBoss,
  EngineMember,
  OptimizationResult,
} from "./types";

export type { OptimizationResult } from "./types";

export interface OptimizeInput {
  profiles: EngineProfile[];
  bosses: EngineBoss[];
  members: EngineMember[];
}

/**
 * Hàm chính: Orchestrator cho toàn bộ engine.
 *
 * 1. Pha 0: Xác định deepest level clearable (ước tính optimistic)
 * 2. Pha 1: Build combos cho tất cả accessible levels
 * 3. Pha 2: ILP Solver (GLPK WASM)
 * 4. Pha 3: Tính kết quả + validate
 */
export async function optimize(input: OptimizeInput): Promise<OptimizationResult> {
  const t0 = Date.now();
  const { profiles, bosses, members } = input;

  const warnings: string[] = [];

  // ── Validation ─────────────────────────────────────────────────────────
  if (bosses.length === 0) {
    throw new Error("Chưa cấu hình boss cho mùa này");
  }
  if (profiles.length === 0) {
    throw new Error("Chưa có profile nào trong mùa này");
  }

  // Chỉ xét profiles của members active trong danh sách
  const validMemberIds = new Set(members.map((m) => m.id));
  const filteredProfiles = profiles.filter((p) => validMemberIds.has(p.memberId));

  // Validate damage values are within safe integer range
  for (const p of filteredProfiles) {
    if (p.damage > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Damage overflow for profile ${p.id}: ${p.damage} exceeds MAX_SAFE_INTEGER`);
    }
  }

  // ── Pha 0: Feasibility Analysis ───────────────────────────────────────
  const deepest = determineScenario(filteredProfiles, bosses);
  const maxAccessibleLevel = Math.min(deepest + 1, 3);

  console.log(`[Engine] Pha 0: deepest=${deepest}, maxAccessibleLevel=${maxAccessibleLevel}`);

  if (deepest === 0) {
    warnings.push("Ước tính: Union chưa đủ lực clear Level 1. Chỉ tối ưu damage trên Level 1.");
  } else if (deepest < 3) {
    warnings.push(
      `Ước tính: Union clear được đến Level ${deepest}. Boss Level ${maxAccessibleLevel} chỉ gây damage, chưa chắc kill hết.`
    );
  }

  // ── Pha 1: Build combos ───────────────────────────────────────────────
  const bossLevelMap = new Map(bosses.map((b) => [b.id, b.level]));

  // Pre-filter profiles to accessible levels
  const accessibleProfiles = filteredProfiles.filter(
    (p) => (bossLevelMap.get(p.bossId) ?? 0) <= maxAccessibleLevel
  );

  const skipped = filteredProfiles.length - accessibleProfiles.length;
  if (skipped > 0) {
    console.log(`[Engine] Level Gate: loại ${skipped} profiles nhắm level > ${maxAccessibleLevel}`);
  }

  const memberCombos = buildCombos(accessibleProfiles, 3);

  // Báo cáo members không có combo
  const warnedMemberIds = new Set<number>();
  for (const member of members) {
    const combos = memberCombos.get(member.id);
    if (!combos || combos.length === 0) {
      warnings.push(
        `${member.name}: không có combo hợp lệ (cần ít nhất 3 boss có profile + đội hình không trùng nhân vật)`
      );
      warnedMemberIds.add(member.id);
    }
  }

  // ── Pha 2: ILP Solver ─────────────────────────────────────────────────
  console.log("[Engine] Starting ILP solver...");
  const entries = await ilpSolve(memberCombos, bosses);
  console.log(`[Engine] ILP solved: ${entries.filter((e) => e.combo).length} assigned`);

  // Add unassigned members
  const assignedIds = new Set(entries.map((e) => e.memberId));
  for (const member of members) {
    if (!assignedIds.has(member.id)) {
      entries.push({
        memberId: member.id,
        combo: null,
        warningMsg: warnedMemberIds.has(member.id)
          ? "Không có combo hợp lệ"
          : "Tất cả boss accessible đã đủ damage",
      });
    }
  }

  // ── Pha 3: Tính tổng kết quả ──────────────────────────────────────────
  const allocated = new Map<number, number>();
  for (const boss of bosses) allocated.set(boss.id, 0);

  for (const entry of entries) {
    if (!entry.combo) continue;
    for (const profile of entry.combo.profiles) {
      const cur = allocated.get(profile.bossId) ?? 0;
      allocated.set(profile.bossId, cur + profile.damage);
    }
    if (entry.warningMsg && !warnedMemberIds.has(entry.memberId)) {
      warnings.push(entry.warningMsg);
    }
  }

  // Boss breakdown
  const bossDamage = bosses.map((boss) => {
    const allocDmg = allocated.get(boss.id) ?? 0;
    const effDmg = Math.min(allocDmg, boss.hp);
    return {
      bossId: boss.id,
      allocatedDamage: allocDmg,
      effectiveDamage: effDmg,
      hp: boss.hp,
      overkill: Math.max(0, allocDmg - boss.hp),
    };
  });

  const totalEffectiveDamage = bossDamage.reduce((s, b) => s + b.effectiveDamage, 0);

  // ── Pha 3B: Validate Level Gate + Warnings ────────────────────────────
  const actualCleared = validateLevelGate(allocated, bosses);

  if (actualCleared < maxAccessibleLevel - 1) {
    for (let lvl = 1; lvl <= maxAccessibleLevel; lvl++) {
      const levelBosses = bosses.filter((b) => b.level === lvl);
      const unclearedBosses = levelBosses.filter(
        (b) => (allocated.get(b.id) ?? 0) < b.hp
      );
      if (unclearedBosses.length > 0 && lvl <= actualCleared + 1) {
        for (const b of unclearedBosses) {
          const deficit = b.hp - (allocated.get(b.id) ?? 0);
          warnings.push(
            `Boss ${b.displayName ?? `S${b.slot}`} Level ${b.level}: thiếu ~${formatDeficit(deficit)} damage`
          );
        }
      }
    }
  }

  // Check level gate violation: damage on level N+1 while level N not cleared
  for (let lvl = 1; lvl < 3; lvl++) {
    if (lvl > actualCleared) {
      const hasHigherDamage = bosses
        .filter((b) => b.level > lvl)
        .some((b) => (allocated.get(b.id) ?? 0) > 0);
      if (hasHigherDamage) {
        warnings.push(
          `⚠ Level ${lvl} chưa clear nhưng có damage trên Level ${lvl + 1}. Combo cross-level gây ra — đây có thể là tối ưu do combo constraint.`
        );
      }
    }
  }

  // Bosses nobody attacked
  for (const b of bossDamage) {
    if (b.allocatedDamage === 0) {
      const boss = bosses.find((x) => x.id === b.bossId);
      if (boss && boss.level <= maxAccessibleLevel) {
        warnings.push(
          `Boss ${boss?.displayName ?? `S${boss.slot}`} Level ${boss.level}: không có ai được phân công đánh`
        );
      }
    }
  }

  return {
    entries,
    totalEffectiveDamage,
    bossDamage,
    warnings: [...new Set(warnings)],
    elapsedMs: Date.now() - t0,
    deepest: actualCleared,
    maxAccessibleLevel,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Pha 0: Ước tính optimistic deepest clearable level.
 */
function determineScenario(
  profiles: EngineProfile[],
  bosses: EngineBoss[]
): number {
  const bossesByLevel = new Map<number, EngineBoss[]>();
  for (const b of bosses) {
    if (!bossesByLevel.has(b.level)) bossesByLevel.set(b.level, []);
    bossesByLevel.get(b.level)!.push(b);
  }

  // Max damage per (member, boss)
  const bestDmg = new Map<string, number>();
  for (const p of profiles) {
    const key = `${p.memberId}:${p.bossId}`;
    bestDmg.set(key, Math.max(bestDmg.get(key) ?? 0, p.damage));
  }

  // Sum max damages per boss
  const maxDmgPerBoss = new Map<number, number>();
  for (const [key, dmg] of bestDmg) {
    const bossId = parseInt(key.split(":")[1]);
    maxDmgPerBoss.set(bossId, (maxDmgPerBoss.get(bossId) ?? 0) + dmg);
  }

  let deepest = 0;
  for (const level of [1, 2, 3]) {
    const levelBosses = bossesByLevel.get(level);
    if (!levelBosses || levelBosses.length === 0) break;
    const canClear = levelBosses.every(
      (b) => (maxDmgPerBoss.get(b.id) ?? 0) >= b.hp
    );
    if (canClear) {
      deepest = level;
    } else {
      break;
    }
  }

  return deepest;
}

/**
 * Validate actual level gate from allocated damage.
 */
function validateLevelGate(
  allocated: Map<number, number>,
  bosses: EngineBoss[]
): number {
  const bossesByLevel = new Map<number, EngineBoss[]>();
  for (const b of bosses) {
    if (!bossesByLevel.has(b.level)) bossesByLevel.set(b.level, []);
    bossesByLevel.get(b.level)!.push(b);
  }

  let cleared = 0;
  for (const level of [1, 2, 3]) {
    const levelBosses = bossesByLevel.get(level);
    if (!levelBosses || levelBosses.length === 0) break;
    const allKilled = levelBosses.every(
      (b) => (allocated.get(b.id) ?? 0) >= b.hp
    );
    if (allKilled) {
      cleared = level;
    } else {
      break;
    }
  }

  return cleared;
}



/** Format deficit for warning messages */
function formatDeficit(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toString();
}
