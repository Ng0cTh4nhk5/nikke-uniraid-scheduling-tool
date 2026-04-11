import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setMemberCookie, clearMemberCookie, isAdmin, getMemberId } from "@/lib/auth";

// POST /api/auth/identify — Chọn identity (C-3 fix: signed cookie)
export async function POST(req: NextRequest) {
  try {
    const { memberId } = await req.json();
    if (!memberId || typeof memberId !== "number") {
      return NextResponse.json({ error: "memberId không hợp lệ" }, { status: 400 });
    }

    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) {
      return NextResponse.json({ error: "Thành viên không tồn tại" }, { status: 404 });
    }

    const res = NextResponse.json({
      success: true,
      member: { id: member.id, name: member.name, role: member.role },
    });
    setMemberCookie(res, member.id); // httpOnly, signed, secure in prod (C-3)
    return res;
  } catch (error) {
    console.error("[POST /api/auth/identify]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// DELETE /api/auth/identify — Huỷ identity
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  clearMemberCookie(res);
  return res;
}

// GET /api/auth/identify — Kiểm tra identity hiện tại + admin status (M-6 fix)
export async function GET(req: NextRequest) {
  const memberId = getMemberId(req);
  const admin = isAdmin(req);

  if (!memberId) {
    return NextResponse.json({ member: null, isAdmin: admin });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, role: true, isActive: true },
  });

  // Member was deleted or deactivated → clear cookie (M-6)
  if (!member || !member.isActive) {
    const res = NextResponse.json({ member: null, isAdmin: admin, expired: true });
    clearMemberCookie(res);
    return res;
  }

  return NextResponse.json({
    member: { id: member.id, name: member.name, role: member.role },
    isAdmin: admin,
  });
}
