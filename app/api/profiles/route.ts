import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMemberId, isAdmin } from "@/lib/auth";
import { serializeProfile } from "@/lib/serialize";

// ── Validation helper (H-2 fix) ──
function validateCharIds(charIds: unknown): charIds is number[] {
  return (
    Array.isArray(charIds) &&
    charIds.length === 5 &&
    charIds.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)
  );
}

// GET /api/profiles?raidId=X&memberId=Y
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const raidId = searchParams.get("raidId");
    const memberId = searchParams.get("memberId");

    const where: Record<string, unknown> = {};
    if (raidId) where.bossSlot = { raidId: parseInt(raidId) };
    if (memberId) where.memberId = parseInt(memberId);

    const profiles = await prisma.profile.findMany({
      where,
      include: {
        member: { select: { id: true, name: true, role: true } },
        bossSlot: { select: { id: true, slot: true, element: true, displayName: true } },
        char1: { select: { id: true, name: true, image: true } },
        char2: { select: { id: true, name: true, image: true } },
        char3: { select: { id: true, name: true, image: true } },
        char4: { select: { id: true, name: true, image: true } },
        char5: { select: { id: true, name: true, image: true } },
      },
      orderBy: { submittedAt: "desc" },
    });

    return NextResponse.json(profiles.map(serializeProfile));
  } catch (error) {
    console.error("[GET /api/profiles]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// POST /api/profiles — Tạo profile mới
export async function POST(req: NextRequest) {
  try {
    const currentMemberId = getMemberId(req);
    if (!currentMemberId) {
      return NextResponse.json({ error: "Chưa xác thực danh tính" }, { status: 401 });
    }

    const body = await req.json();
    const { bossSlotId, charIds, damage, notes } = body;

    // H-2: Strict validation
    if (!bossSlotId || typeof bossSlotId !== "number") {
      return NextResponse.json({ error: "bossSlotId không hợp lệ" }, { status: 400 });
    }
    if (!validateCharIds(charIds)) {
      return NextResponse.json({ error: "charIds phải là array gồm 5 số nguyên dương" }, { status: 400 });
    }
    if (typeof damage !== "number" || damage <= 0 || !Number.isFinite(damage)) {
      return NextResponse.json({ error: "damage phải là số dương" }, { status: 400 });
    }

    // Verify bossSlot exists and raid is not closed
    const bossSlot = await prisma.bossSlot.findUnique({
      where: { id: bossSlotId },
      include: { raid: { select: { status: true } } },
    });
    if (!bossSlot) {
      return NextResponse.json({ error: "Boss slot không tồn tại" }, { status: 404 });
    }
    if (bossSlot.raid.status === "closed") {
      return NextResponse.json({ error: "Raid đã đóng — không thể tạo profile" }, { status: 403 });
    }

    const profile = await prisma.profile.create({
      data: {
        memberId: currentMemberId,
        bossSlotId,
        char1Id: charIds[0],
        char2Id: charIds[1],
        char3Id: charIds[2],
        char4Id: charIds[3],
        char5Id: charIds[4],
        damage: BigInt(Math.round(damage)),
        notes: notes ?? null,
      },
      include: {
        member: { select: { id: true, name: true, role: true } },
        bossSlot: { select: { id: true, slot: true, element: true, displayName: true } },
      },
    });

    return NextResponse.json(serializeProfile(profile), { status: 201 });
  } catch (error) {
    console.error("[POST /api/profiles]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// PUT /api/profiles — Sửa profile
export async function PUT(req: NextRequest) {
  try {
    const currentMemberId = getMemberId(req);
    if (!currentMemberId) {
      return NextResponse.json({ error: "Chưa xác thực danh tính" }, { status: 401 });
    }

    const body = await req.json();
    const { id, bossSlotId, charIds, damage, notes } = body;

    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    }

    // H-3: Explicitly reject memberId in body
    if ("memberId" in body) {
      return NextResponse.json({ error: "Không được thay đổi memberId" }, { status: 400 });
    }

    // Check ownership
    const existing = await prisma.profile.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Profile không tồn tại" }, { status: 404 });
    }
    if (existing.memberId !== currentMemberId && !isAdmin(req)) {
      return NextResponse.json({ error: "Không có quyền sửa profile người khác" }, { status: 403 });
    }

    // Check raid status
    const bossSlot = await prisma.bossSlot.findUnique({
      where: { id: existing.bossSlotId },
      include: { raid: { select: { status: true } } },
    });
    if (bossSlot?.raid.status === "closed") {
      return NextResponse.json({ error: "Raid đã đóng — không thể sửa profile" }, { status: 403 });
    }

    // H-2: Validate only provided fields
    const data: Record<string, unknown> = {};
    if (bossSlotId !== undefined) {
      if (typeof bossSlotId !== "number") {
        return NextResponse.json({ error: "bossSlotId không hợp lệ" }, { status: 400 });
      }
      data.bossSlotId = bossSlotId;
    }
    if (charIds !== undefined) {
      if (!validateCharIds(charIds)) {
        return NextResponse.json({ error: "charIds phải là array gồm 5 số nguyên dương" }, { status: 400 });
      }
      data.char1Id = charIds[0];
      data.char2Id = charIds[1];
      data.char3Id = charIds[2];
      data.char4Id = charIds[3];
      data.char5Id = charIds[4];
    }
    if (damage !== undefined) {
      if (typeof damage !== "number" || damage <= 0 || !Number.isFinite(damage)) {
        return NextResponse.json({ error: "damage phải là số dương" }, { status: 400 });
      }
      data.damage = BigInt(Math.round(damage));
    }
    if (notes !== undefined) data.notes = notes;

    const updated = await prisma.profile.update({
      where: { id },
      data,
      include: {
        member: { select: { id: true, name: true, role: true } },
        bossSlot: { select: { id: true, slot: true, element: true, displayName: true } },
      },
    });

    return NextResponse.json(serializeProfile(updated));
  } catch (error) {
    console.error("[PUT /api/profiles]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// DELETE /api/profiles?id=X
export async function DELETE(req: NextRequest) {
  try {
    const currentMemberId = getMemberId(req);
    if (!currentMemberId) {
      return NextResponse.json({ error: "Chưa xác thực danh tính" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get("id") ?? "");
    if (isNaN(id)) {
      return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    }

    // Check ownership
    const existing = await prisma.profile.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Profile không tồn tại" }, { status: 404 });
    }
    if (existing.memberId !== currentMemberId && !isAdmin(req)) {
      return NextResponse.json({ error: "Không có quyền xóa profile người khác" }, { status: 403 });
    }

    // Check raid status
    const bossSlot = await prisma.bossSlot.findUnique({
      where: { id: existing.bossSlotId },
      include: { raid: { select: { status: true } } },
    });
    if (bossSlot?.raid.status === "closed") {
      return NextResponse.json({ error: "Raid đã đóng — không thể xóa profile" }, { status: 403 });
    }

    await prisma.profile.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/profiles]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
