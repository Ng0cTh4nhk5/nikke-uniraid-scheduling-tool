# Thuật toán Phân công Lượt đánh Union Raid

Tài liệu này mô tả chi tiết thuật toán tối ưu hoá phân công lượt đánh Union Raid trong game NIKKE: Goddess of Victory. Engine được triển khai tại thư mục `engine/` và được gọi thông qua API endpoint `POST /api/optimize`.

---

## 1. Bối cảnh bài toán

### 1.1. Luật chơi Union Raid

Trong Union Raid, một Union (clan) cùng nhau đánh **5 boss** trong mỗi mùa. Mỗi boss có 3 mức HP tương ứng với 3 level. Để mở khoá Level tiếp theo, Union phải tiêu diệt **toàn bộ** 5 boss ở level hiện tại.

Mỗi thành viên trong union có **3 lượt đánh** mỗi ngày. Trong mỗi lượt, thành viên sử dụng một đội hình gồm **5 nhân vật** để đánh **1 boss** nhất định. Ràng buộc quan trọng là **không được dùng lại cùng một nhân vật** trong các lượt đánh khác nhau trong cùng một ngày — nghĩa là 15 nhân vật trên 3 lượt phải hoàn toàn khác biệt.

### 1.2. Mục tiêu tối ưu

Bài toán đặt ra: **Phân công lượt đánh cho tất cả thành viên sao cho tổng sát thương hiệu quả (effective damage) là lớn nhất**, đồng thời thoả mãn các ràng buộc:

1. Mỗi thành viên chọn đúng **1 combo** (3 đội hình đánh 3 boss, tổng 15 nhân vật khác biệt), hoặc không được phân công.
2. Damage hiệu quả trên mỗi boss được **cap tại HP** (damage vượt quá HP là overkill, không tính vào mục tiêu).
3. Phải tuân thủ **Level Gate** — chỉ được đánh boss level N+1 khi đã clear hết level N.

### 1.3. Dữ liệu đầu vào

| Thực thể | Mô tả |
|-----------|--------|
| **BossSlot** | 5 boss, mỗi boss có 3 level HP (`hpLevel1`, `hpLevel2`, `hpLevel3`) → tổng 15 "engine boss" |
| **Profile** | Kết quả mock battle: thành viên X dùng đội hình 5 nhân vật đánh boss Y, gây damage Z |
| **Member** | Chỉ xét thành viên vai trò `regular` (finisher/cleaner do Union Leader chỉ định thủ công) |

Mỗi Profile trong DB (đánh 1 BossSlot) được nhân bản thành 3 EngineProfile tương ứng 3 level, vì cùng đội hình đánh cùng boss nhưng ở level khác nhau sẽ gây cùng damage, chỉ khác HP boss.

---

## 2. Kiến trúc Engine

Engine hoạt động theo pipeline 4 pha tuần tự:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Pha 0     │────▶│   Pha 1      │────▶│   Pha 2     │────▶│    Pha 3        │
│ Feasibility │     │ Combo Builder│     │ ILP Solver  │     │ Post-processing │
│  Analysis   │     │              │     │  (GLPK)     │     │  & Validation   │
└─────────────┘     └──────────────┘     └─────────────┘     └─────────────────┘
```

### Source files

| File | Vai trò |
|------|---------|
| `engine/index.ts` | Orchestrator: điều phối 4 pha, tổng hợp kết quả |
| `engine/combo_builder.ts` | Pha 1: sinh tổ hợp combo hợp lệ cho mỗi thành viên |
| `engine/ilp_solver.ts` | Pha 2: giải bài toán ILP bằng GLPK WASM |
| `engine/types.ts` | Định nghĩa kiểu dữ liệu dùng chung |
| `app/api/optimize/route.ts` | API layer: chuyển đổi dữ liệu DB → Engine → lưu kết quả |

---

## 3. Pha 0 — Feasibility Analysis

**Mục đích:** Ước tính mức level cao nhất mà Union có thể clear được, từ đó giới hạn không gian bài toán.

### Thuật toán

```
function determineScenario(profiles, bosses):
    Với mỗi (member, boss), lấy max damage tốt nhất
    Với mỗi boss, cộng tổng max damage từ tất cả members
    
    deepest = 0
    for level = 1 → 3:
        if mỗi boss ở level đều có tổng damage ≥ HP:
            deepest = level
        else:
            break
    
    return deepest
```

**Ý nghĩa các biến:**
- `deepest`: Level cao nhất mà Union *chắc chắn* clear được (ước tính lạc quan — chưa tính ràng buộc nhân vật trùng lặp)
- `maxAccessibleLevel = min(deepest + 1, 3)`: Level cao nhất mà thành viên *có thể* đánh vào (level cao hơn sẽ bị loại khỏi bài toán)

**Ví dụ:** Nếu `deepest = 2`, Union clear được Level 1 và 2. Thành viên sẽ được phân đánh boss ở Level 1, 2 và 3. Boss Level 3 chỉ gây damage chứ chưa chắc kill hết.

### Lọc profile theo level

Sau pha 0, tất cả profile nhắm vào boss ở level > `maxAccessibleLevel` bị loại bỏ. Điều này giảm đáng kể số lượng combo ở Pha 1.

---

## 4. Pha 1 — Combo Builder

**Mục đích:** Cho mỗi thành viên, sinh ra tất cả combo hợp lệ (3 đội hình × 3 boss, 15 nhân vật không trùng).

**File:** `engine/combo_builder.ts`

### 4.1. Cấu trúc dữ liệu

```
EngineCombo {
    memberId: number
    profiles: [Profile, Profile, Profile]   // 3 profiles, mỗi cái đánh 1 boss khác nhau
    rawDamage: number                       // Tổng damage thô (chưa cap HP)
}
```

### 4.2. Thuật toán

```
function buildCombos(profiles, topK=3):
    1. Nhóm profiles theo memberId → bossId
    
    2. Với mỗi member:
        a. Mỗi boss, giữ lại top-K profiles (theo damage giảm dần)
           → Cắt tỉa: chỉ giữ K=3 profile tốt nhất cho mỗi cặp (member, boss)
        
        b. Liệt kê tất cả C(n, 3) bộ ba boss khác nhau
           (n = số boss mà member có profile)
        
        c. Với mỗi bộ ba boss (A, B, C):
            - Thử mọi tổ hợp: 1 profile từ boss A × 1 profile từ boss B × 1 profile từ boss C
            - Kiểm tra: tổng 15 nhân vật (5×3) phải hoàn toàn khác biệt
            - Nếu hợp lệ → thêm vào danh sách combo
        
        d. Nếu số combo > 500 → sắp xếp theo rawDamage giảm dần, giữ top 500
    
    return Map<memberId, EngineCombo[]>
```

### 4.3. Kiểm tra nhân vật không trùng

```
function charsAreUnique(p1, p2, p3):
    seen = Set()
    for profile in [p1, p2, p3]:
        for charId in profile.charIds:    // 5 nhân vật mỗi profile
            if charId in seen: return false
            seen.add(charId)
    return true    // 15 IDs đều distinct
```

### 4.4. Độ phức tạp

Giả sử 1 thành viên có profile cho `n` boss, mỗi boss giữ `K` profile:

- Số bộ ba boss: `C(n, 3)`
- Mỗi bộ ba: `K³` tổ hợp profile
- Tổng: `C(n, 3) × K³`

Với `n = 15` (5 boss × 3 level), `K = 3`: `C(15, 3) × 27 = 455 × 27 = 12,285` tổ hợp/member.

Cap `MAX_COMBOS_PER_MEMBER = 500` đảm bảo ILP solver không bị quá tải.

---

## 5. Pha 2 — ILP Solver (GLPK WASM)

**Mục đích:** Tìm phương án phân combo tối ưu cho toàn bộ Union bằng Integer Linear Programming.

**File:** `engine/ilp_solver.ts`

**Solver:** GLPK (GNU Linear Programming Kit), chạy dưới dạng WebAssembly module trên server.

### 5.1. Mô hình toán học

#### Biến quyết định

| Biến | Miền | Ý nghĩa |
|------|------|---------|
| `y[m,c]` | `{0, 1}` | Thành viên `m` có chọn combo `c` hay không |
| `e[b]` | `[0, HP_b]` | Sát thương hiệu quả lên boss `b` (capped tại HP) |
| `g[N]` | `{0, 1}` | Level Gate: 1 nếu toàn bộ boss level `N` đã bị tiêu diệt |

#### Hàm mục tiêu

```
Maximize  Z = Σ_b  e[b]
```

Tối đa hoá tổng damage hiệu quả trên tất cả boss (đã cap tại HP).

#### Ràng buộc

**(C1) Mỗi thành viên chọn tối đa 1 combo:**

```
Σ_c  y[m,c]  ≤  1     ∀ member m
```

**(C2) Damage hiệu quả ≤ damage thực tế gây ra:**

```
e[b]  ≤  Σ_{(m,c): b ∈ combo c}  damage(m, b, c) · y[m,c]     ∀ boss b
```

Trong đó `damage(m, b, c)` là damage của thành viên `m` đánh boss `b` theo combo `c`.

**(C3) Damage hiệu quả ≤ HP boss (cap):**

```
e[b]  ≤  HP[b]     ∀ boss b
```

Ràng buộc này được mã hoá qua upper bound của biến `e[b]`.

**(C4) Level Gate — Gate variable:**

Với mỗi level `N ∈ {1, 2}`:

**Gate chỉ mở khi kill hết boss level N:**
```
g[N] · HP[b]  ≤  Σ damage · y[m,c]     ∀ boss b ∈ Level N
```
(Biến đổi: `g[N] · HP[b] - Σ damage·y ≤ 0`)

**Damage trên level N+1 bị gate bởi g[N]:**
```
Σ damage · y[m,c]  ≤  M · g[N]     ∀ boss b ∈ Level N+1
```

Trong đó `M` (big-M) = tổng damage tối đa có thể gây lên boss đó (upper bound đủ lớn).

### 5.2. Xử lý ổn định số học (Numerical Scaling)

GLPK WASM gặp vấn đề bất ổn số khi hệ số ở mức `10^10` ~ `10^12` (damage trong game NIKKE). Engine chia tất cả giá trị damage và HP cho hệ số `SCALE = 1,000,000` trước khi đưa vào model.

```typescript
const SCALE = 1_000_000;
// Damage coefficient: profile.damage / SCALE
// HP bound:           boss.hp / SCALE
```

Việc scaling đồng nhất không ảnh hưởng tới nghiệm tối ưu (các biến binary `y` không đổi).

### 5.3. Tham số solver

| Tham số | Giá trị | Ý nghĩa |
|---------|---------|---------|
| `msglev` | `GLP_MSG_ERR` | Chỉ in error messages |
| `tmlim` | 30 → 60 → 120s | Timeout (tăng dần qua retry) |
| `mipgap` | 0.005 (0.5%) | Chấp nhận lời giải nếu gap ≤ 0.5% so với optimal |

### 5.4. Cơ chế Retry

```
timeouts = [30s, 60s, 120s]

for each attempt:
    try:
        solve with timeout
        return result
    catch:
        reset GLPK WASM singleton (phòng WASM bị corrupt)
        retry with longer timeout

throw error after 3 failures
```

### 5.5. Trích xuất lời giải

```
for each member m:
    for each combo c of member m:
        if y[m,c] ≈ 1 (round):
            assign combo c to member m
            break
```

---

## 6. Pha 3 — Post-processing & Validation

**Mục đích:** Tính toán thống kê, kiểm tra tính hợp lệ của lời giải, sinh cảnh báo.

### 6.1. Tổng hợp damage

```
for each assigned entry:
    for each profile in combo:
        allocated[bossId] += profile.damage

for each boss:
    effectiveDamage = min(allocated, HP)
    overkill = max(0, allocated - HP)

totalEffectiveDamage = Σ effectiveDamage
```

### 6.2. Validate Level Gate

```
function validateLevelGate(allocated, bosses):
    cleared = 0
    for level = 1 → 3:
        if mọi boss level đều có allocated ≥ HP:
            cleared = level
        else:
            break
    return cleared
```

So sánh `actualCleared` với `maxAccessibleLevel` để phát hiện trường hợp ước tính Pha 0 quá lạc quan.

### 6.3. Cảnh báo tự động

Engine sinh các cảnh báo sau:

| Cảnh báo | Điều kiện |
|----------|-----------|
| Member không có combo hợp lệ | `combos.length === 0` — thiếu profile hoặc nhân vật bị trùng giữa các boss |
| Boss thiếu damage | `allocated < HP` ở các level ≤ `actualCleared + 1` |
| Level Gate violation | Có damage ở level N+1 nhưng level N chưa clear |
| Boss không ai đánh | `allocatedDamage === 0` ở boss trong phạm vi accessible |
| Union chưa đủ lực | `deepest === 0` — ước tính không clear nổi Level 1 |

---

## 7. Luồng dữ liệu API → Engine → DB

```
POST /api/optimize { raidId }
│
├─ 1. Load từ DB: Raid + BossSlots + Profiles + Members(regular)
│
├─ 2. Chuyển đổi dữ liệu:
│     BossSlot (5 slots) × 3 levels = 15 EngineBoss
│     Profile × 3 levels = 3N EngineProfile
│     (N = số profile gốc)
│
├─ 3. Gọi optimize(profiles, bosses, members)
│     → Pha 0 → Pha 1 → Pha 2 → Pha 3
│     → OptimizationResult
│
├─ 4. Lưu kết quả vào DB:
│     Assignment (metadata, scenario number, params JSON)
│     └── AssignmentEntry[] (mỗi member: 3 profileId + 3 level)
│
└─ 5. Trả JSON response
```

### Reverse Mapping

Engine dùng synthetic ID cho profile (mỗi DB profile được nhân bản 3 lần cho 3 level). Sau khi solver trả kết quả, API layer dùng `reverseMap` để ánh xạ ngược:

```
synthetic profile ID → { originalProfileId, level }
```

Từ đó lưu vào `AssignmentEntry`:
- `profile1Id`, `profile2Id`, `profile3Id` = profile gốc trong DB
- `level1`, `level2`, `level3` = level mà profile được phân đánh

---

## 8. Ví dụ minh hoạ

### Bài toán

- **Union**: 3 thành viên (A, B, C)
- **Bosses**: 2 boss (Fire, Water), mỗi boss 2 level
- **Boss HP**: Level 1 = 100M, Level 2 = 200M

### Profile đã submit

| Thành viên | Boss | Đội hình | Damage |
|------------|------|----------|--------|
| A | Fire | {Char1, Char2, Char3, Char4, Char5} | 60M |
| A | Water | {Char6, Char7, Char8, Char9, Char10} | 50M |
| A | Fire | {Char11, Char12, Char3, Char4, Char5} | 55M |
| B | Fire | {Char1, Char13, Char14, Char15, Char16} | 45M |
| B | Water | {Char6, Char17, Char18, Char19, Char20} | 70M |
| C | Fire | {Char2, Char21, Char22, Char23, Char24} | 40M |
| C | Water | {Char7, Char25, Char26, Char27, Char28} | 35M |

### Quá trình

1. **Pha 0:** Tổng max damage cho Fire = 60+45+40 = 145M ≥ 100M ✓. Tổng cho Water = 50+70+35 = 155M ≥ 100M ✓. `deepest = 1`, `maxAccessibleLevel = 2`.

2. **Pha 1:** Build combo cho mỗi thành viên (3 đội hình đánh 3 boss khác nhau). Trong ví dụ đơn giản 2 boss thì không đủ 3 boss cho combo — thực tế game có 5 boss × 3 level = 15 "engine boss".

3. **Pha 2:** ILP solver tìm phân công tối ưu global, cân nhắc:
   - Cap damage tại HP ↔ Tránh overkill
   - Level Gate ↔ Ưu tiên clear level thấp trước
   - Nhân vật không trùng ↔ Đã xử lý từ Pha 1

4. **Pha 3:** Tổng hợp kết quả, tính overkill, sinh cảnh báo.

---

## 9. Giới hạn & Lưu ý kỹ thuật

### 9.1. Giới hạn

| Hạn chế | Chi tiết |
|---------|----------|
| Top-K pruning | Chỉ giữ 3 profile tốt nhất mỗi (member, boss) → có thể bỏ lỡ combo tối ưu nếu profile yếu hơn tạo combo tổng tốt hơn |
| Combo cap | Tối đa 500 combo/member → lời giải không chắc chắn tối ưu tuyệt đối |
| Numerical precision | GLPK WASM dùng floating-point. Scaling giảm thiểu nhưng không loại bỏ hoàn toàn sai số |
| Damage đồng nhất qua level | Damage không thay đổi theo level boss (cùng đội hình → cùng damage). Trong thực tế game có thể có khác biệt nhỏ |
| MIP gap | Chấp nhận lời giải trong 0.5% optimal → không phải luôn tối ưu tuyệt đối |
| Chỉ optimize cho `regular` | Finisher/cleaner được phân công thủ công bởi Union Leader |

### 9.2. Xử lý sai số

- **BigInt → Number**: HP và damage trong DB lưu dưới dạng `BigInt`. Chuyển sang `Number` trước khi đưa vào solver. An toàn tới ~9×10¹⁵ (`Number.MAX_SAFE_INTEGER`).
- **SCALE = 1,000,000**: Giảm hệ số từ 10¹⁰~10¹² xuống 10⁴~10⁶ để GLPK xử lý ổn định.

### 9.3. Performance

| Metric | Giá trị điển hình |
|--------|------------------|
| Combo build time | < 100ms (30 members) |
| ILP solve time | 1–30s (tuỳ kích thước model) |
| Total pipeline | 2–35s |
| Binary variables | ~`30 × 500` = 15,000 `y` vars + 15 `e` vars + 2 gate vars |
| Constraints | ~30 member + 15 boss damage + 5~10 gate ≈ 50–55 constraints |

---

## 10. Thuật ngữ

| Thuật ngữ | Giải thích |
|-----------|------------|
| **Combo** | Bộ 3 profile (3 đội hình đánh 3 boss) của 1 member, không trùng nhân vật |
| **Profile** | Kết quả mock battle: đội hình 5 char + damage lên 1 boss |
| **Effective Damage** | `min(allocated_damage, boss_HP)` — damage thực sự hữu ích |
| **Overkill** | `max(0, allocated_damage - boss_HP)` — damage dư thừa, lãng phí |
| **Level Gate** | Ràng buộc: phải clear hết boss level N mới được đánh level N+1 |
| **ILP** | Integer Linear Programming — Quy hoạch tuyến tính nguyên |
| **GLPK** | GNU Linear Programming Kit — thư viện giải LP/MIP mã nguồn mở |
| **Big-M** | Kỹ thuật "big-M method" trong MIP: dùng hằng số đủ lớn để mô hình hoá ràng buộc logic (if-then) |
| **MIP Gap** | Khoảng cách giữa lời giải hiện tại và cận trên tối ưu lý thuyết |
| **Scaling** | Chia hệ số cho 10⁶ để tránh bất ổn số trong solver |
