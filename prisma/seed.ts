import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";

// ── Seed Data ────────────────────────────────────────────────────────────
import { memberData } from "./seed-data/members";
import { bossSlotData } from "./seed-data/bosses";
import { profileDamages } from "./seed-data/profiles";
import { testRaidConfig, newRaidConfig } from "./seed-data/raids";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url: dbUrl });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

interface NikkeCharacter {
  name: string;
  element: string;
  class: string;
  burst: string;
  weapon: string;
  manufacturer: string;
  image: string;
}

async function main() {
  console.log("🌱 Seeding database...");

  // ── Characters (185 nhân vật từ nikke_characters.json) ──────────────────
  const charactersPath = join(__dirname, "seed-data", "nikke_characters.json");
  const charactersData: NikkeCharacter[] = JSON.parse(
    readFileSync(charactersPath, "utf-8")
  );

  console.log(`  → Seeding ${charactersData.length} characters...`);
  for (const char of charactersData) {
    await prisma.character.upsert({
      where: { name: char.name },
      update: {},
      create: {
        name: char.name,
        element: char.element,
        class: char.class,
        burst: char.burst,
        weapon: char.weapon,
        manufacturer: char.manufacturer,
        image: char.image,
      },
    });
  }
  console.log(`  ✓ ${charactersData.length} characters seeded.`);

  // Lấy danh sách character đã có id từ db để giả lập team
  const storedCharacters = await prisma.character.findMany({ take: 25 }); // Lấy 25 nv cho 5 team (1 team/boss)
  if (storedCharacters.length < 25) {
    console.error(`❌ Need at least 25 characters in DB for mock teams, got ${storedCharacters.length}`);
    process.exit(1);
  }

  // ── Members (32 thành viên từ Union) ────────────────────────────────────
  const memberNames = memberData.map((m) => m.name);
  const dbMembers = [];
  for (const m of memberData) {
    const mem = await prisma.member.upsert({
      where: { name: m.name },
      update: { role: m.role, synchroDeviceLevel: m.synchroDeviceLevel },
      create: { name: m.name, role: m.role, synchroDeviceLevel: m.synchroDeviceLevel },
    });
    dbMembers.push(mem);
  }

  // Xoá member cũ không còn trong danh sách (cascade xoá profile + assignments)
  const staleMembers = await prisma.member.deleteMany({
    where: { name: { notIn: [...memberNames] } },
  });
  if (staleMembers.count > 0) {
    console.log(`  ⚠ Deleted ${staleMembers.count} stale members (not in current list).`);
  }
  console.log(`  ✓ ${memberData.length} members seeded.`);

  // ────────────────────────────────────────────────────────────────────────
  //  RAID 1: Test Raid (dữ liệu mẫu, status = closed)
  // ────────────────────────────────────────────────────────────────────────

  const testRaid = await prisma.raid.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: testRaidConfig.name,
      hardModeDate: testRaidConfig.hardModeDate,
      status: testRaidConfig.status,
      notes: testRaidConfig.notes,
    },
  });
  console.log(`  ✓ Test raid created: "${testRaid.name}"`);

  // Xóa dữ liệu cũ của test raid
  await prisma.assignment.deleteMany({ where: { raidId: testRaid.id } });
  await prisma.profile.deleteMany({ where: { bossSlot: { raidId: testRaid.id } } });

  // BossSlots cho test raid
  const dbBossSlots = [];
  for (const bs of bossSlotData) {
    const slot = await prisma.bossSlot.upsert({
      where: { raidId_slot: { raidId: testRaid.id, slot: bs.slot } },
      update: { hpLevel1: bs.hpLevel1, hpLevel2: bs.hpLevel2, hpLevel3: bs.hpLevel3 },
      create: { raidId: testRaid.id, ...bs },
    });
    dbBossSlots.push(slot);
  }
  console.log("  ✓ 5 boss slots seeded (test raid).");

  // Profiles cho test raid
  let profilesCreated = 0;
  for (let i = 0; i < dbMembers.length; i++) {
    const member = dbMembers[i];
    if (i >= profileDamages.length) break;

    const damages = profileDamages[i];

    for (let bossIndex = 0; bossIndex < 5; bossIndex++) {
      const dmg = damages[bossIndex];
      if (dmg > 0n) {
        const teamStart = bossIndex * 5;
        await prisma.profile.create({
          data: {
            memberId: member.id,
            bossSlotId: dbBossSlots[bossIndex].id,
            char1Id: storedCharacters[teamStart + 0].id,
            char2Id: storedCharacters[teamStart + 1].id,
            char3Id: storedCharacters[teamStart + 2].id,
            char4Id: storedCharacters[teamStart + 3].id,
            char5Id: storedCharacters[teamStart + 4].id,
            damage: dmg,
            notes: "Seeded (test data)",
          }
        });
        profilesCreated++;
      }
    }
  }
  console.log(`  ✓ ${profilesCreated} mock profiles seeded (test raid).`);

  // ────────────────────────────────────────────────────────────────────────
  //  RAID 2: Mùa mới (trống, sẵn sàng xài)
  // ────────────────────────────────────────────────────────────────────────

  const newRaid = await prisma.raid.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: newRaidConfig.name,
      status: newRaidConfig.status,
      notes: newRaidConfig.notes,
    },
  });
  console.log(`  ✓ New raid created: "${newRaid.name}" (draft — chưa có boss/profile)`);

  // ── Cleanup: xoá profile rác (orphaned) ────────────────────────────────
  const validMemberIds = dbMembers.map((m) => m.id);
  const orphanedProfiles = await prisma.profile.deleteMany({
    where: { memberId: { notIn: validMemberIds } },
  });
  if (orphanedProfiles.count > 0) {
    console.log(`  ⚠ Deleted ${orphanedProfiles.count} orphaned profiles.`);
  }

  console.log("✅ Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
