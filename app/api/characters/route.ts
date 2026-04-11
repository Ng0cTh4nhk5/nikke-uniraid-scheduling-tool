import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/characters — Danh sách nhân vật (có filter)
// Query params: element, class, burst, weapon, manufacturer, search
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const element = searchParams.get("element");
    const cls = searchParams.get("class");
    const burst = searchParams.get("burst");
    const weapon = searchParams.get("weapon");
    const manufacturer = searchParams.get("manufacturer");
    const search = searchParams.get("search");

    const characters = await prisma.character.findMany({
      where: {
        ...(element && { element }),
        ...(cls && { class: cls }),
        ...(burst && { burst }),
        ...(weapon && { weapon }),
        ...(manufacturer && { manufacturer }),
        ...(search && { name: { contains: search } }),
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(characters);
  } catch (error) {
    console.error("[GET /api/characters]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// POST /api/characters — Thêm nhân vật mới (admin only)
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { name, class: cls, burst, weapon, element, manufacturer, image } = body;

    if (!name?.trim() || !cls || !burst || !weapon || !element || !manufacturer) {
      return NextResponse.json({ error: "Thiếu thông tin nhân vật" }, { status: 400 });
    }

    const character = await prisma.character.create({
      data: {
        name: name.trim(),
        class: cls,
        burst,
        weapon,
        element,
        manufacturer,
        image: image ?? null,
      },
    });
    return NextResponse.json(character, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Nhân vật đã tồn tại" }, { status: 409 });
    }
    console.error("[POST /api/characters]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
