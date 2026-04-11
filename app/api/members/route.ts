import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/members — Danh sách thành viên
export async function GET() {
  try {
    const members = await prisma.member.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json(members);
  } catch (error) {
    console.error("[GET /api/members]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// POST /api/members — Thêm thành viên (H-5: admin only)
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { name, role, synchroDeviceLevel, notes } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Tên không hợp lệ" }, { status: 400 });
    }
    const member = await prisma.member.create({
      data: {
        name: name.trim(),
        role: role ?? "regular",
        synchroDeviceLevel: synchroDeviceLevel ?? 1,
        notes: notes ?? null,
      },
    });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    console.error("[POST /api/members]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
