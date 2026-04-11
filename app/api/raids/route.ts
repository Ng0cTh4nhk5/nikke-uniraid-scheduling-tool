import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/raids — Danh sách tất cả mùa raid
export async function GET() {
  try {
    const raids = await prisma.raid.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { bossSlots: true } } },
    });
    return NextResponse.json(raids);
  } catch (error) {
    console.error("[GET /api/raids]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// POST /api/raids — Tạo mùa mới (H-5: admin only)
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { name, hardModeDate, notes } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Tên mùa không hợp lệ" }, { status: 400 });
    }

    const raid = await prisma.raid.create({
      data: {
        name: name.trim(),
        hardModeDate: hardModeDate ? new Date(hardModeDate) : null,
        notes: notes ?? null,
      },
    });
    return NextResponse.json(raid, { status: 201 });
  } catch (error) {
    console.error("[POST /api/raids]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
