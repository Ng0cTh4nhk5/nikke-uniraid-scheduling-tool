import { NextRequest, NextResponse } from "next/server";
import { getAdminPassword, setAdminCookie, clearAdminCookie } from "@/lib/auth";

// POST /api/auth/admin — Đăng nhập admin (C-1, C-2 fix)
export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const adminPassword = getAdminPassword(); // throws if not configured (C-2)

    if (password !== adminPassword) {
      return NextResponse.json({ error: "Sai mật khẩu" }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });
    setAdminCookie(res); // httpOnly, signed cookie (C-1)
    return res;
  } catch (error) {
    console.error("[POST /api/auth/admin]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// DELETE /api/auth/admin — Đăng xuất admin
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  clearAdminCookie(res);
  return res;
}
