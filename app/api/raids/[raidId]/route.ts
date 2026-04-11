import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { serializeBossSlot } from "@/lib/serialize";

type Params = { params: Promise<{ raidId: string }> };

// GET /api/raids/[raidId] — Chi tiết 1 mùa raid (kèm bossSlots + assignments)
export async function GET(_req: NextRequest, { params }: Params) {
  const { raidId } = await params;
  const id = parseInt(raidId);
  if (isNaN(id)) return NextResponse.json({ error: "raidId không hợp lệ" }, { status: 400 });

  try {
    const raid = await prisma.raid.findUnique({
      where: { id },
      include: {
        bossSlots: { orderBy: { slot: "asc" } },
        assignments: {
          orderBy: { generatedAt: "desc" },
          take: 5,
        },
      },
    });
    if (!raid) return NextResponse.json({ error: "Không tìm thấy raid" }, { status: 404 });

    return NextResponse.json({
      ...raid,
      bossSlots: raid.bossSlots.map(serializeBossSlot),
    });
  } catch (error) {
    console.error("[GET /api/raids/[raidId]]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// PATCH /api/raids/[raidId] — Cập nhật raid (H-5: admin only)
export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { raidId } = await params;
  const id = parseInt(raidId);
  if (isNaN(id)) return NextResponse.json({ error: "raidId không hợp lệ" }, { status: 400 });

  try {
    const body = await req.json();
    const { name, status, hardModeDate, notes } = body;

    const allowed = ["draft", "active", "closed"];
    if (status && !allowed.includes(status)) {
      return NextResponse.json({ error: "status không hợp lệ" }, { status: 400 });
    }

    const raid = await prisma.raid.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(status && { status }),
        ...(hardModeDate !== undefined && { hardModeDate: hardModeDate ? new Date(hardModeDate) : null }),
        ...(notes !== undefined && { notes }),
      },
    });
    return NextResponse.json(raid);
  } catch (error) {
    console.error("[PATCH /api/raids/[raidId]]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// DELETE /api/raids/[raidId] (H-5: admin only)
export async function DELETE(req: NextRequest, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { raidId } = await params;
  const id = parseInt(raidId);
  if (isNaN(id)) return NextResponse.json({ error: "raidId không hợp lệ" }, { status: 400 });

  try {
    await prisma.raid.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/raids/[raidId]]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
