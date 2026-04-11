import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { serializeProfile } from "@/lib/serialize";

type Params = { params: Promise<{ id: string }> };

// GET /api/assignments/[id] — Chi tiết 1 assignment
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);
  if (isNaN(id)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });

  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        raid: { select: { id: true, name: true, status: true } },
        entries: {
          include: {
            member: { select: { id: true, name: true, role: true } },
            profile1: {
              include: {
                bossSlot: { select: { slot: true, element: true, displayName: true } },
                char1: { select: { name: true, image: true } },
                char2: { select: { name: true, image: true } },
                char3: { select: { name: true, image: true } },
                char4: { select: { name: true, image: true } },
                char5: { select: { name: true, image: true } },
              },
            },
            profile2: {
              include: {
                bossSlot: { select: { slot: true, element: true, displayName: true } },
                char1: { select: { name: true, image: true } },
                char2: { select: { name: true, image: true } },
                char3: { select: { name: true, image: true } },
                char4: { select: { name: true, image: true } },
                char5: { select: { name: true, image: true } },
              },
            },
            profile3: {
              include: {
                bossSlot: { select: { slot: true, element: true, displayName: true } },
                char1: { select: { name: true, image: true } },
                char2: { select: { name: true, image: true } },
                char3: { select: { name: true, image: true } },
                char4: { select: { name: true, image: true } },
                char5: { select: { name: true, image: true } },
              },
            },
          },
          orderBy: { member: { name: "asc" } },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Không tìm thấy assignment" }, { status: 404 });
    }

    // Serialize BigInt in profiles
    const serialized = {
      ...assignment,
      entries: assignment.entries.map((entry) => ({
        ...entry,
        profile1: entry.profile1 ? serializeProfile(entry.profile1) : null,
        profile2: entry.profile2 ? serializeProfile(entry.profile2) : null,
        profile3: entry.profile3 ? serializeProfile(entry.profile3) : null,
      })),
    };

    return NextResponse.json(serialized);
  } catch (error) {
    console.error("[GET /api/assignments/[id]]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// PATCH /api/assignments/[id] — Cập nhật status (H-5: admin only)
export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id: idStr } = await params;
  const id = parseInt(idStr);
  if (isNaN(id)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });

  try {
    const body = await req.json();
    const { status, notes } = body;

    const allowedStatuses = ["draft", "published"];
    if (status && !allowedStatuses.includes(status)) {
      return NextResponse.json({ error: "status không hợp lệ" }, { status: 400 });
    }

    const updated = await prisma.assignment.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/assignments/[id]]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
