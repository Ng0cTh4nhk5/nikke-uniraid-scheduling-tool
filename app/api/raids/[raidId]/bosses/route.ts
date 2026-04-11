import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { serializeBossSlot } from "@/lib/serialize";
import { ALL_ELEMENTS } from "@/lib/constants"; // L-3 fix: reuse constant

type Params = { params: Promise<{ raidId: string }> };

// GET /api/raids/[raidId]/bosses — Lấy 5 boss slots của 1 mùa
export async function GET(_req: NextRequest, { params }: Params) {
  const { raidId } = await params;
  const id = parseInt(raidId);
  if (isNaN(id)) return NextResponse.json({ error: "raidId không hợp lệ" }, { status: 400 });

  try {
    const bossSlots = await prisma.bossSlot.findMany({
      where: { raidId: id },
      orderBy: { slot: "asc" },
    });
    return NextResponse.json(bossSlots.map(serializeBossSlot));
  } catch (error) {
    console.error("[GET /api/raids/[raidId]/bosses]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// PUT /api/raids/[raidId]/bosses — Upsert 5 boss slot configs (H-5: admin only)
// Body: Array of { slot, element, displayName?, hpLevel1, hpLevel2, hpLevel3, notes? }
export async function PUT(req: NextRequest, { params }: Params) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { raidId } = await params;
  const id = parseInt(raidId);
  if (isNaN(id)) return NextResponse.json({ error: "raidId không hợp lệ" }, { status: 400 });

  try {
    const body: Array<{
      slot: number;
      element: string;
      displayName?: string;
      hpLevel1: number;
      hpLevel2: number;
      hpLevel3: number;
      notes?: string;
    }> = await req.json();

    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json({ error: "Body phải là array boss configs" }, { status: 400 });
    }

    // Validate từng boss slot
    for (const bs of body) {
      if (![1, 2, 3, 4, 5].includes(bs.slot)) {
        return NextResponse.json({ error: `slot không hợp lệ: ${bs.slot}` }, { status: 400 });
      }
      if (!(ALL_ELEMENTS as readonly string[]).includes(bs.element)) {
        return NextResponse.json({ error: `element không hợp lệ: ${bs.element}` }, { status: 400 });
      }
      if (!bs.hpLevel1 || bs.hpLevel1 <= 0 || !bs.hpLevel2 || bs.hpLevel2 <= 0 || !bs.hpLevel3 || bs.hpLevel3 <= 0) {
        return NextResponse.json({ error: "Tất cả HP phải > 0" }, { status: 400 });
      }
    }

    // Upsert từng boss slot
    const results = await Promise.all(
      body.map((bs) =>
        prisma.bossSlot.upsert({
          where: { raidId_slot: { raidId: id, slot: bs.slot } },
          update: {
            element: bs.element,
            hpLevel1: BigInt(bs.hpLevel1),
            hpLevel2: BigInt(bs.hpLevel2),
            hpLevel3: BigInt(bs.hpLevel3),
            displayName: bs.displayName ?? null,
            notes: bs.notes ?? null,
          },
          create: {
            raidId: id,
            slot: bs.slot,
            element: bs.element,
            hpLevel1: BigInt(bs.hpLevel1),
            hpLevel2: BigInt(bs.hpLevel2),
            hpLevel3: BigInt(bs.hpLevel3),
            displayName: bs.displayName ?? null,
            notes: bs.notes ?? null,
          },
        })
      )
    );

    return NextResponse.json(results.map(serializeBossSlot));
  } catch (error) {
    console.error("[PUT /api/raids/[raidId]/bosses]", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
