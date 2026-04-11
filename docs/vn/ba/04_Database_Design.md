# Thiết kế Cơ sở Dữ liệu (Database Design)

---

## 1. Nguyên tắc thiết kế

### 1.1 Công nghệ
- **ORM:** Prisma v7 với `@prisma/adapter-better-sqlite3`
- **Database:** SQLite (single-file, portable)
- **Schema:** Prisma Schema Language (`prisma/schema.prisma`)
- **Seed:** TypeScript (`prisma/seed.ts`) — chạy qua `tsx`

### 1.2 Những gì được lưu trữ
| Thực thể | Lưu hay tính? | Lý do |
|----------|--------------|-------|
| Member | ✅ Lưu | Tương đối cố định qua các mùa |
| BossSlot (HP 3 levels, element) | ✅ Lưu | Thay đổi theo từng mùa raid |
| Profile (mock battle result) | ✅ Lưu | Dữ liệu đầu vào cốt lõi |
| Combo hợp lệ | ❌ Không lưu | **Tính on-the-fly** từ profiles — tránh stale data |
| Assignment (kết quả phân công) | ✅ Lưu snapshot | Leader xem lại, không cần tính lại |
| Character (nhân vật NIKKE) | ✅ Lưu (seed) | Danh mục cố định, thêm khi game cập nhật |

### 1.3 Quyết định thiết kế quan trọng: BossSlot thay vì Boss row-per-level

**Phiên bản cũ (v1):** Bảng `bosses` với mỗi row = 1 boss ở 1 level cụ thể (15 rows = 5 slot × 3 level).

**Phiên bản hiện tại (v2):** Bảng `BossSlot` với mỗi row = 1 slot boss, **embed 3 cột HP** cho 3 levels:

```
BossSlot {
  slot: 1-5
  element: Fire|Water|Wind|Iron|Electric
  hpLevel1: BigInt
  hpLevel2: BigInt
  hpLevel3: BigInt
}
```

**Lý do:** Trong NIKKE Union Raid, 5 boss giữ nguyên hệ qua 3 level — chỉ HP thay đổi. Mô hình BossSlot tránh duplication và đơn giản hoá CRUD (admin chỉ cần cấu hình 5 rows thay vì 15).

> **Hệ quả cho Engine:** API route `POST /api/optimize` tự expand 5 BossSlot → 15 EngineBoss (5 × 3 levels) trước khi đưa vào engine.

---

## 2. Schema chi tiết (Prisma Schema)

### 2.1 Model `Raid` — Mùa Union Raid

```prisma
model Raid {
  id             Int          @id @default(autoincrement())
  name           String       // "UniRaid #12 - Tháng 4/2026"
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
- `draft`: Admin đang cấu hình boss
- `active`: Thành viên có thể submit profile, Admin có thể chạy optimizer
- `closed`: Khoá mọi thao tác (profile, optimize)

---

### 2.2 Model `BossSlot` — Cấu hình Boss (5 per raid)

```prisma
model BossSlot {
  id          Int     @id @default(autoincrement())
  raidId      Int
  slot        Int     // 1–5
  element     String  // 'Fire' | 'Water' | 'Wind' | 'Iron' | 'Electric'
  displayName String?
  hpLevel1    BigInt  // HP ở Level 1
  hpLevel2    BigInt  // HP ở Level 2
  hpLevel3    BigInt  // HP ở Level 3
  notes       String?

  raid        Raid      @relation(...)
  profiles    Profile[]

  @@unique([raidId, slot])       // Mỗi slot chỉ 1 boss
  @@unique([raidId, element])    // 5 hệ phải khác nhau
  @@index([raidId])
}
```

**Diễn giải các cột:**
| Cột | Ý nghĩa | Ví dụ |
|-----|---------|-------|
| `slot` | Vị trí boss 1-5 | `3` |
| `element` | Hệ của boss | `'Fire'` |
| `hpLevel1/2/3` | HP tại mỗi level | HP tăng dần: L1 < L2 < L3 |
| `displayName` | Tên hiển thị tuỳ chọn | `'Kraken'`, `'Ifrit'` |

> **BigInt:** HP boss có thể lên tới hàng tỷ (>2^31), nên dùng `BigInt`. Khi serialize qua JSON (API response), convert sang `string` bằng `serializeBossSlot()`.

---

### 2.3 Model `Character` — Danh sách nhân vật NIKKE

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

  // 5 FK từ Profile → Character (đặt tên @relation riêng)
  profilesAsChar1 Profile[] @relation("ProfileChar1")
  profilesAsChar2 Profile[] @relation("ProfileChar2")
  profilesAsChar3 Profile[] @relation("ProfileChar3")
  profilesAsChar4 Profile[] @relation("ProfileChar4")
  profilesAsChar5 Profile[] @relation("ProfileChar5")
}
```

> **Seed data:** 185+ nhân vật từ file `nikke_characters.json`. Seed lần đầu khi khởi tạo DB. Admin có thể thêm nhân vật mới qua API.

---

### 2.4 Model `Member` — Thành viên Union

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

**Vai trò (role):**
| Giá trị | Ý nghĩa | Tham gia Optimizer? |
|---------|---------|---------------------|
| `regular` | Thành viên thông thường | ✅ Có — chỉ role `regular` được đưa vào ILP |
| `finisher` | Acc mạnh, Leader giữ riêng | ❌ Không (Leader phân công thủ công) |
| `cleaner` | Acc dự phòng xử lý sai sót | ❌ Không (Leader phân công thủ công) |

> **Lưu ý:** API route `POST /api/optimize` chỉ load members có `isActive: true` **VÀ** `role: "regular"` vào engine.

---

### 2.5 Model `Profile` — Kết quả Mock Battle

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

**Diễn giải:**
- Profile thuộc 1 `BossSlot` (không phải Boss riêng lẻ). Optimizer sẽ expand profile này thành 3 EngineProfile (1 per level) vì cùng team có thể đánh boss ở bất kỳ level nào.
- `damage` là kết quả mock battle (BigInt). API serialize sang `string` khi truyền qua JSON.
- **Quyền sở hữu:** Chỉ member tạo profile mới được sửa/xoá (hoặc Admin). Kiểm tra qua signed cookie `nikke_member_id`.

---

### 2.6 Model `Assignment` — Kết quả phân công (snapshot)

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

**`paramsJson` chứa metadata:**
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

### 2.7 Model `AssignmentEntry` — Chi tiết từng dòng phân công

```prisma
model AssignmentEntry {
  id           Int  @id @default(autoincrement())
  assignmentId Int
  memberId     Int
  profile1Id   Int?
  profile2Id   Int?
  profile3Id   Int?
  level1       Int?  // Level (1/2/3) mà profile 1 được assign đánh
  level2       Int?
  level3       Int?
  execOrder1   Int?  // Wave thực hiện (1/2/3)
  execOrder2   Int?
  execOrder3   Int?
  isManual     Boolean @default(false)
  notes        String?

  assignment Assignment @relation(...)
  member     Member     @relation(...)
  profile1   Profile?   @relation("EntryProfile1", ...)
  profile2   Profile?   @relation("EntryProfile2", ...)
  profile3   Profile?   @relation("EntryProfile3", ...)

  @@unique([assignmentId, memberId])  // 1 dòng/member/assignment
  @@index([assignmentId])
  @@index([memberId])
}
```

**Diễn giải `level1/2/3`:**
- Vì mỗi DB Profile nhắm 1 BossSlot (không chỉ 1 level cụ thể), engine phải quyết định profile đó được dùng ở level nào.
- `level1 = 2` nghĩa là profile1 được phân công đánh boss tại Level 2.

**Diễn giải `execOrder`:**
- `execOrder1 = 1` → Wave 1 (đánh ngay khi Hard Mode mở)
- `execOrder1 = 2` → Wave 2 (chờ Level 1 clear xong mới đánh)
- Hiện tại chưa được engine populate tự động (set null).

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

## 4. Quyết định thiết kế & Trade-offs

| Quyết định | Lựa chọn | Lý do |
|-----------|---------|-------|
| Lưu combo? | ❌ Không | Derived data — tính on-the-fly để luôn đồng bộ |
| Nhân vật: JSON hay cột? | 5 cột FK (`char1Id`–`char5Id`) | Validated qua FK, query được |
| Member static hay per-raid? | **Static** (global) | Member ít thay đổi, tái sử dụng qua nhiều mùa |
| Boss: 15 rows vs 5 rows + embedded HP? | **5 BossSlot** + `hpLevel1/2/3` | Giảm duplication, đơn giản CRUD cho admin |
| Lưu kết quả? | ✅ Snapshot (Assignment + entries) | Leader cần xem lại, copy Discord |
| 1 hay nhiều kết quả/raid? | Nhiều (có `scenario` auto-increment) | So sánh các lần chạy |
| Database engine? | SQLite + Prisma adapter | Single-file, portable, không cần setup server |
| BigInt handling? | `BigInt` in DB, serialize to `string` in API | HP/damage > 2^31, JSON không hỗ trợ BigInt native |
| Delete behavior: Raid? | `onDelete: Cascade` cho BossSlot, Assignment | Xoá raid = xoá sạch dữ liệu liên quan |
| Delete behavior: Member? | `onDelete: Cascade` cho Profile, AssignmentEntry | Xoá member = xoá profile và entries |
| Delete behavior: Character? | `onDelete: Restrict` cho Profile | Không cho xoá nhân vật đang được dùng trong profile |
| Delete behavior: Profile in entry? | `onDelete: SetNull` | Entry vẫn tồn tại dù profile bị xoá (graceful degradation) |

---

## 5. Serialization (BigInt → JSON)

SQLite và Prisma adapter trả về `BigInt` cho các cột HP và damage. JSON.stringify **không hỗ trợ BigInt**, nên cần serialize trước khi trả response:

```typescript
// lib/serialize.ts
function serializeBossSlot(bs) {
  return { ...bs, hpLevel1: bs.hpLevel1.toString(), hpLevel2: ..., hpLevel3: ... }
}

function serializeProfile(p) {
  return { ...p, damage: p.damage.toString() }
}
```

Frontend nhận string và convert sang `number` khi cần tính toán (an toàn vì damage < MAX_SAFE_INTEGER ≈ 9×10^15). Engine validate BigInt range trước khi convert.

---

## 6. Dữ liệu seed (`prisma/seed.ts`)

Seed script tạo dữ liệu ban đầu:

1. **Characters:** 185+ nhân vật từ `nikke_characters.json` (upsert — idempotent)
2. **Members:** 32 thành viên với tên, role, synchroDeviceLevel (upsert)
3. **Test Raid:** 1 raid `[TEST] UniRaid Tháng 3/2026` (status: closed) gồm:
   - 5 BossSlots: Porter(Iron), Plate(Water), Land Eater(Electric), Rebuild Fingers(Fire), Material(Wind)
   - HP data và mock profiles inline trong `seed.ts`
4. **New Raid:** 1 raid `UniRaid Tháng 4/2026` (status: draft) — trống, sẵn sàng xài

```bash
# Chạy seed
npm run db:seed
# Tương đương: npx tsx prisma/seed.ts
```
