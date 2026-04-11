import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ memberId: string }> };

// PATCH /api/members/[memberId] (H-5: admin only)
export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { memberId } = await params;
  const id = parseInt(memberId);
  if (isNaN(id)) return NextResponse.json({ error: "memberId không hợp lệ" }, { status: 400 });

  try {
    const body = await req.json();
    const { name, role, synchroDeviceLevel, isActive, notes } = body;

    const member = await prisma.member.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(role && { role }),
        ...(synchroDeviceLevel !== undefined && { synchroDeviceLevel }),
        ...(isActive !== undefined && { isActive }),
        ...(notes !== undefined && { notes }),
      },
    });
    return NextResponse.json(member);
  } catch (error) {
    console.error("[PATCH /api/members/[memberId]]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// DELETE /api/members/[memberId] (H-5: admin only)
export async function DELETE(req: NextRequest, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { memberId } = await params;
  const id = parseInt(memberId);
  if (isNaN(id)) return NextResponse.json({ error: "memberId không hợp lệ" }, { status: 400 });

  try {
    await prisma.member.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/members/[memberId]]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
