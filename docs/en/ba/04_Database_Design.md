# Database Design Document

---

## 1. Design Principles

### 1.1 Technology
- **ORM:** Prisma v7 with `@prisma/adapter-better-sqlite3`
- **Database:** SQLite (single-file, portable)
- **Schema:** Prisma Schema Language (`prisma/schema.prisma`)
- **Seed:** TypeScript (`prisma/seed.ts`) — run via `tsx`

### 1.2 What Gets Stored
| Entity | Stored or Computed? | Reason |
|--------|---------------------|--------|
| Member | ✅ Stored | Relatively stable across raid seasons |
| BossSlot (HP for 3 levels, element) | ✅ Stored | Changes each raid season |
| Profile (mock battle result) | ✅ Stored | Core input data |
| Valid Combos | ❌ Not stored | **Computed on-the-fly** from profiles — avoids stale data |
| Assignment (optimization result) | ✅ Stored as snapshot | Leader reviews later, no need to recompute |
| Character (NIKKE character) | ✅ Stored (seeded) | Fixed catalog, additions when game updates |

### 1.3 Key Design Decision: BossSlot Instead of Row-per-Level Boss

**Old version (v1):** A `bosses` table where each row = 1 boss at 1 specific level (15 rows = 5 slots × 3 levels).

**Current version (v2):** A `BossSlot` table where each row = 1 boss slot, **embedding 3 HP columns** for 3 levels:

```
BossSlot {
  slot: 1-5
  element: Fire|Water|Wind|Iron|Electric
  hpLevel1: BigInt
  hpLevel2: BigInt
  hpLevel3: BigInt
}
```

**Rationale:** In NIKKE Union Raid, the 5 bosses retain the same element across all 3 levels — only HP changes. The BossSlot model avoids duplication and simplifies CRUD (the admin only needs to configure 5 rows instead of 15).

> **Engine consequence:** The API route `POST /api/optimize` automatically expands 5 BossSlots → 15 EngineBosses (5 × 3 levels) before passing data to the engine.

---

## 2. Schema Details (Prisma Schema)

### 2.1 Model `Raid` — Union Raid Season

```prisma
model Raid {
  id             Int          @id @default(autoincrement())
  name           String       // "UniRaid #12 - April 2026"
  hardModeDate   DateTime?
  status         String       @default("draft") // 'draft' | 'active' | 'closed'
  notes          String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  bossSlots      BossSlot[]
  assignments    Assignment[]
}
```

**Status flow:** `draft` → `active` → `closed`
- `draft`: Admin is configuring bosses
- `active`: Members can submit profiles, Admin can run the optimizer
- `closed`: All operations locked (profiles, optimize)

---

### 2.2 Model `BossSlot` — Boss Configuration (5 per raid)

```prisma
model BossSlot {
  id          Int     @id @default(autoincrement())
  raidId      Int
  slot        Int     // 1–5
  element     String  // 'Fire' | 'Water' | 'Wind' | 'Iron' | 'Electric'
  displayName String?
  hpLevel1    BigInt  // HP at Level 1
  hpLevel2    BigInt  // HP at Level 2
  hpLevel3    BigInt  // HP at Level 3
  notes       String?

  raid        Raid      @relation(...)
  profiles    Profile[]

  @@unique([raidId, slot])       // Each slot has only one boss
  @@unique([raidId, element])    // 5 elements must be distinct
  @@index([raidId])
}
```

**Column descriptions:**
| Column | Meaning | Example |
|--------|---------|---------|
| `slot` | Boss position 1-5 | `3` |
| `element` | Boss element | `'Fire'` |
| `hpLevel1/2/3` | HP at each level | Increasing: L1 < L2 < L3 |
| `displayName` | Optional display name | `'Kraken'`, `'Ifrit'` |

> **BigInt:** Boss HP can reach billions (>2^31), so `BigInt` is used. When serializing via JSON (API response), convert to `string` using `serializeBossSlot()`.

---

### 2.3 Model `Character` — NIKKE Character List

```prisma
model Character {
  id           Int     @id @default(autoincrement())
  name         String  @unique
  class        String  // 'Attacker' | 'Defender' | 'Supporter'
  burst        String  // '1' | '2' | '3' | 'p' (Red Hood)
  weapon       String  // 'AR' | 'RL' | 'SR' | 'SMG' | 'SG' | 'MG'
  element      String  // 'Fire' | 'Water' | 'Wind' | 'Iron' | 'Electric'
  manufacturer String  // 'Tetra' | 'Elysion' | 'Missilis' | 'Pilgrim' | 'Abnormal'
  image        String? // '/images/characters/alice.webp'

  // 5 FKs from Profile → Character (each with a named @relation)
  profilesAsChar1 Profile[] @relation("ProfileChar1")
  profilesAsChar2 Profile[] @relation("ProfileChar2")
  profilesAsChar3 Profile[] @relation("ProfileChar3")
  profilesAsChar4 Profile[] @relation("ProfileChar4")
  profilesAsChar5 Profile[] @relation("ProfileChar5")
}
```

> **Seed data:** 185+ characters from `nikke_characters.json`. Seeded on first DB initialization. Admins can add new characters via the API.

---

### 2.4 Model `Member` — Union Member

```prisma
model Member {
  id                  Int      @id @default(autoincrement())
  name                String   @unique
  role                String   @default("regular") // 'regular' | 'finisher' | 'cleaner'
  synchroDeviceLevel  Int      @default(1)
  isActive            Boolean  @default(true)
  notes               String?
  updatedAt           DateTime @updatedAt

  profiles            Profile[]
  assignmentEntries   AssignmentEntry[]
}
```

**Roles:**
| Value | Meaning | Included in Optimizer? |
|-------|---------|----------------------|
| `regular` | Standard member | ✅ Yes — only `regular` role members are passed to the ILP |
| `finisher` | Strong account, held by Leader | ❌ No (Leader assigns manually) |
| `cleaner` | Backup account for handling mistakes | ❌ No (Leader assigns manually) |

> **Note:** The API route `POST /api/optimize` only loads members with `isActive: true` **AND** `role: "regular"` into the engine.

---

### 2.5 Model `Profile` — Mock Battle Result

```prisma
model Profile {
  id          Int      @id @default(autoincrement())
  memberId    Int
  bossSlotId  Int
  char1Id     Int
  char2Id     Int
  char3Id     Int
  char4Id     Int
  char5Id     Int
  damage      BigInt
  submittedAt DateTime @default(now())
  updatedAt   DateTime @updatedAt
  notes       String?

  member      Member    @relation(...)
  bossSlot    BossSlot  @relation(...)
  char1       Character @relation("ProfileChar1", ...)
  char2       Character @relation("ProfileChar2", ...)
  char3       Character @relation("ProfileChar3", ...)
  char4       Character @relation("ProfileChar4", ...)
  char5       Character @relation("ProfileChar5", ...)

  assignmentEntriesAsP1 AssignmentEntry[] @relation("EntryProfile1")
  assignmentEntriesAsP2 AssignmentEntry[] @relation("EntryProfile2")
  assignmentEntriesAsP3 AssignmentEntry[] @relation("EntryProfile3")

  @@index([memberId])
  @@index([bossSlotId])
  @@index([memberId, bossSlotId])
}
```

**Notes:**
- A Profile belongs to 1 `BossSlot` (not a specific level). The optimizer expands this profile into 3 EngineProfiles (1 per level) since the same team attacking the same boss at a different level deals the same damage, differing only in boss HP.
- `damage` is the mock battle result (BigInt). The API serializes it to `string` when transmitting via JSON.
- **Ownership:** Only the member who created the profile may edit/delete it (or Admin). Verified via signed cookie `nikke_member_id`.

---

### 2.6 Model `Assignment` — Optimization Result (Snapshot)

```prisma
model Assignment {
  id          Int      @id @default(autoincrement())
  raidId      Int
  generatedAt DateTime @default(now())
  scenario    Int      // auto-increment per raid
  paramsJson  String   // JSON: { mode, elapsedMs, totalEffectiveDamage, deepest, ... }
  status      String   @default("draft") // 'draft' | 'published'
  notes       String?

  raid    Raid              @relation(...)
  entries AssignmentEntry[]

  @@unique([raidId, scenario])
  @@index([raidId])
}
```

**`paramsJson` contains metadata:**
```json
{
  "mode": "ilp",
  "elapsedMs": 2345,
  "totalEffectiveDamage": 82000000000,
  "deepest": 2,
  "maxAccessibleLevel": 3,
  "bossDamage": [
    {
      "slot": 1, "level": 1, "element": "Water",
      "displayName": "Kraken",
      "hp": 30000000000, "allocatedDamage": 30000000000,
      "effectiveDamage": 30000000000, "overkill": 0
    }
  ]
}
```

---

### 2.7 Model `AssignmentEntry` — Per-Member Assignment Detail

```prisma
model AssignmentEntry {
  id           Int  @id @default(autoincrement())
  assignmentId Int
  memberId     Int
  profile1Id   Int?
  profile2Id   Int?
  profile3Id   Int?
  level1       Int?  // Level (1/2/3) that profile 1 is assigned to attack
  level2       Int?
  level3       Int?
  execOrder1   Int?  // Wave to execute (1/2/3)
  execOrder2   Int?
  execOrder3   Int?
  isManual     Boolean @default(false)
  notes        String?

  assignment Assignment @relation(...)
  member     Member     @relation(...)
  profile1   Profile?   @relation("EntryProfile1", ...)
  profile2   Profile?   @relation("EntryProfile2", ...)
  profile3   Profile?   @relation("EntryProfile3", ...)

  @@unique([assignmentId, memberId])  // 1 row per member per assignment
  @@index([assignmentId])
  @@index([memberId])
}
```

**Interpretation of `level1/2/3`:**
- Since each DB Profile targets 1 BossSlot (not a specific level), the engine must decide which level a given profile will be used at.
- `level1 = 2` means profile1 is assigned to attack the boss at Level 2.

**Interpretation of `execOrder`:**
- `execOrder1 = 1` → Wave 1 (attack as soon as Hard Mode opens)
- `execOrder1 = 2` → Wave 2 (wait for Level 1 to be cleared before attacking)
- Currently not automatically populated by the engine (set to null).

---

## 3. Entity Relationship Diagram (ERD)

```
┌────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Raid     │──1:N──►│   BossSlot      │──1:N──► │   Profile       │
│────────────│         │─────────────────│         │─────────────────│
│ id (PK)    │         │ id (PK)         │         │ id (PK)         │
│ name       │         │ raidId (FK)     │         │ bossSlotId (FK) │
│ status     │         │ slot (1-5)      │         │ memberId (FK)   │
│ hardMode.. │         │ element         │         │ char1..5Id (FK) │
│ notes      │         │ hpLevel1/2/3    │         │ damage (BigInt) │
│ createdAt  │         │ displayName     │         │ submittedAt     │
│ updatedAt  │         │ notes           │         │ notes           │
└────────────┘         └─────────────────┘         └─────────────────┘
      │                                                     ▲
      │ 1:N                                                 │ ×3
      ▼                                            ┌────────┴───────────┐
┌───────────────────┐                              │  AssignmentEntry   │
│   Assignment      │──1:N──────────────────────► │────────────────────│
│───────────────────│                              │ id (PK)            │
│ id (PK)           │                              │ assignmentId (FK)  │
│ raidId (FK)       │                              │ memberId (FK)      │
│ scenario          │                              │ profile1Id (FK?)   │
│ paramsJson        │                              │ profile2Id (FK?)   │
│ status            │                              │ profile3Id (FK?)   │
│ notes             │                              │ level1/2/3         │
│ generatedAt       │                              │ execOrder1/2/3     │
└───────────────────┘                              │ isManual           │
                                                   │ notes              │
┌────────────┐                                     └────────────────────┘
│  Member    │──1:N──► Profile
│────────────│──1:N──► AssignmentEntry
│ id (PK)    │
│ name       │                         ┌─────────────────┐
│ role       │                         │   Character     │
│ synchro..  │                         │─────────────────│
│ isActive   │                         │ id (PK)         │
│ notes      │                         │ name (unique)   │
│ updatedAt  │                         │ class, burst    │
└────────────┘                         │ weapon, element │
                                       │ manufacturer    │
                                       │ image           │
                                       └─────────────────┘
                                       ▲ ×5 (char1..5Id)
                                       └── Profile
```

---

## 4. Design Decisions & Trade-offs

| Decision | Choice | Reason |
|----------|--------|--------|
| Store combos? | ❌ No | Derived data — computed on-the-fly to stay in sync |
| Characters: JSON or columns? | 5 FK columns (`char1Id`–`char5Id`) | FK-validated, queryable |
| Member: static or per-raid? | **Static** (global) | Members change infrequently, reused across seasons |
| Boss: 15 rows vs 5 rows + embedded HP? | **5 BossSlots** + `hpLevel1/2/3` | Reduces duplication, simpler CRUD for admin |
| Store results? | ✅ Snapshot (Assignment + entries) | Leader needs to review and copy to Discord |
| Single or multiple results per raid? | Multiple (with `scenario` auto-increment) | Compare different optimizer runs |
| Database engine? | SQLite + Prisma adapter | Single-file, portable, no server setup needed |
| BigInt handling? | `BigInt` in DB, serialize to `string` in API | HP/damage > 2^31, JSON doesn't natively support BigInt |
| Delete behavior: Raid? | `onDelete: Cascade` for BossSlot, Assignment | Deleting a raid removes all related data |
| Delete behavior: Member? | `onDelete: Cascade` for Profile, AssignmentEntry | Deleting a member removes their profiles and entries |
| Delete behavior: Character? | `onDelete: Restrict` for Profile | Prevent deleting characters currently used in profiles |
| Delete behavior: Profile in entry? | `onDelete: SetNull` | Entry persists even if profile is deleted (graceful degradation) |

---

## 5. Serialization (BigInt → JSON)

SQLite and the Prisma adapter return `BigInt` for HP and damage columns. JSON.stringify **does not support BigInt**, so serialization is required before sending a response:

```typescript
// lib/serialize.ts
function serializeBossSlot(bs) {
  return { ...bs, hpLevel1: bs.hpLevel1.toString(), hpLevel2: ..., hpLevel3: ... }
}

function serializeProfile(p) {
  return { ...p, damage: p.damage.toString() }
}
```

The frontend receives strings and converts to `number` when calculations are needed (safe since damage < MAX_SAFE_INTEGER ≈ 9×10^15). The engine validates the BigInt range before converting.

---

## 6. Seed Data (`prisma/seed.ts`)

The seed script creates initial data:

1. **Characters:** 185+ characters from `nikke_characters.json` (upsert — idempotent)
2. **Members:** 32 members with names, roles, and synchroDeviceLevel (upsert)
3. **Test Raid:** 1 raid `[TEST] UniRaid March/2026` (status: closed) including:
   - 5 BossSlots: Porter(Iron), Plate(Water), Land Eater(Electric), Rebuild Fingers(Fire), Material(Wind)
   - HP data and mock profiles inline in `seed.ts`
4. **New Raid:** 1 raid `UniRaid April/2026` (status: draft) — empty, ready to use

```bash
# Run seed
npm run db:seed
# Equivalent: npx tsx prisma/seed.ts
```
