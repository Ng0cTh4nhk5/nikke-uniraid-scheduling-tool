# Thiết kế Giải pháp (Solution Design)

---

## 1. Tổng quan thuật toán (Algorithm Overview)

Tool sử dụng **ILP (Integer Linear Programming)** để giải bài toán phân công lượt đánh. Solver chạy phía server bằng **GLPK.js (WASM)**.

| Đặc điểm | Chi tiết |
|-----------|----------|
| **Solver** | GLPK.js (GNU Linear Programming Kit — WASM, chạy phía server Node.js) |
| **Chất lượng kết quả** | Tối ưu chính xác (exact optimal) |
| **Thời gian chạy** | 1–10 giây (32 thành viên × 5 boss) |
| **Retry** | 3 lần: timeout 30s → 60s → 120s, reset WASM singleton giữa các lần |

> **Ghi chú lịch sử:** Phiên bản đầu tiên sử dụng HiGHS WASM. Tuy nhiên HiGHS WASM gặp lỗi `null function or function signature mismatch` trên model > 1000 binary vars. Đã chuyển sang GLPK.js từ v2.0.

Quy trình gồm 4 pha:

```
┌─────────────────────────────────────┐
│  Pha 0: Phân tích khả thi           │  ← Xác định deepest clearable level
│  Input: Tổng dmg khả dụng + HP(b)   │
│  Output: deepest, maxAccessibleLevel│
├─────────────────────────────────────┤
│  Pha 1: Xây dựng Combo hợp lệ       │  ← Tiền xử lý
│  Input: Profiles từ mock battle     │
│  Output: C(m) cho từng thành viên   │
│  Filter: top-K per boss, max 500    │
├─────────────────────────────────────┤
│  Pha 2: ILP Solver (GLPK WASM)      │  ← Tối ưu chính xác
│  Input: C(m) + HP(b) + Level Gate   │
│  Output: y(m,c) = combo được chọn   │
├─────────────────────────────────────┤
│  Pha 3: Kiểm tra & Xuất kết quả     │  ← Hậu xử lý + validate
│  Input: Kết quả gán                 │
│  Output: Lịch phân công + warnings  │
└─────────────────────────────────────┘
```

---

## 2. Pha 0 — Phân tích khả thi (Feasibility Analysis)

Trước khi làm gì, engine xác định **Union có thể clear đến level nào** dựa trên tổng damage khả dụng.

### 2.1 Ước tính tổng damage tối đa

Với mỗi boss $b$, tổng damage khả dụng được ước tính là:

$$\text{maxDMG}(b) = \sum_{m \in M} \max_{p \in P(m),\ b_p = b} dmg_p$$

**Diễn giải:** Với mỗi boss, lấy **kết quả mock tốt nhất của từng member** rồi cộng lại. Đây là **trần trên lạc quan** (optimistic upper bound) vì giả sử ai cũng dùng được đội tốt nhất cho boss đó (thực tế có thể bị khoá nhân vật do combo constraint).

### 2.2 Xác định Scenario

```
FUNCTION determineScenario(profiles, bosses):

    // Group bosses by level
    bossesByLevel = groupBy(bosses, boss.level)

    // Best damage per (member, boss)
    bestDmg = Map<"memberId:bossId", maxDamage>

    // Sum per boss
    maxDmgPerBoss = Map<bossId, sum of bestDmg>

    deepest = 0

    FOR level IN [1, 2, 3]:
        levelBosses = bossesByLevel[level]
        IF levelBosses is empty: BREAK
        canClear = ALL levelBosses satisfy (maxDmgPerBoss[b.id] ≥ b.hp)
        IF canClear:
            deepest = level
        ELSE:
            BREAK    // Không thể vượt qua level này

    RETURN deepest
```

### 2.3 Chiến lược theo Scenario

- `maxAccessibleLevel = min(deepest + 1, 3)`
- Profiles nhắm boss ở level > `maxAccessibleLevel` bị **loại trước khi build combo**.

| `deepest` | maxAccessible | Chiến lược |
|-----------|---------------|------------|
| 3 | 3 | Kill sạch cả L1→L2→L3, tối thiểu overkill |
| 2 | 3 | Kill L1→L2, tối đa effective dmg trên L3 |
| 1 | 2 | Kill L1, tối đa effective dmg trên L2 |
| 0 | 1 | Tối đa effective dmg trên L1 |

> **Lưu ý:** maxAccessibleLevel = deepest + 1 (capped at 3). Profiles cho level > maxAccessibleLevel bị loại trước khi build combo ở Pha 1.

---

## 3. Pha 1 — Xây dựng Combo hợp lệ

### 3.1 Input
Tập profile của từng thành viên $m$, mỗi profile:
$$p = (m,\ b,\ \text{chars}_p,\ dmg_p)$$

**Lưu ý về data model:** Trong codebase, mỗi `BossSlot` lưu HP cho cả 3 level (hpLevel1, hpLevel2, hpLevel3). API route `/api/optimize` sẽ **expand** mỗi DB profile thành 3 EngineProfile (1 profile × 3 levels = 3 synthetic profiles), tạo bản đồ 15 "EngineBoss" (5 slot × 3 level) từ 5 BossSlot.

### 3.2 Thuật toán

```
FUNCTION buildCombos(profiles, topK=3):

    // Group: memberId → bossId → profiles
    byMember = groupByMember(profiles)

    FOR each member m:
        byBoss = groupByBoss(byMember[m])

        // Keep top-K profiles per boss (sorted by damage desc)
        FOR each boss in byBoss:
            byBoss[boss] = sortByDamageDesc(byBoss[boss]).take(topK)

        bossEntries = [...byBoss entries]
        n = bossEntries.length

        IF n < 3:
            C(m) = []    // Cần ít nhất 3 boss khác nhau
            CONTINUE

        combos = []

        // Liệt kê C(n, 3) bộ ba boss
        FOR (i, j, k) in C(n, 3):
            FOR pa in bossEntries[i].profiles:
                FOR pb in bossEntries[j].profiles:
                    FOR pc in bossEntries[k].profiles:
                        IF charsAreUnique(pa, pb, pc):
                            combos.add({pa, pb, pc})

        // Cap: chỉ giữ top 500 combo (by rawDamage desc)
        IF combos.length > 500:
            combos.sortByRawDamageDesc()
            combos.truncate(500)

        C(m) = combos
```

### 3.3 Các giới hạn thực tế

| Tham số | Giá trị | Lý do |
|---------|---------|-------|
| `topK` | 3 | Mỗi member × mỗi boss chỉ giữ top 3 profile → giảm combo explosion |
| `MAX_COMBOS_PER_MEMBER` | 500 | Tránh ILP model quá lớn. Combo thứ 501 trở đi là suboptimal |

### 3.4 Kiểm tra overlap nhân vật

```
FUNCTION charsAreUnique(p1, p2, p3) → boolean:
    seen = Set<number>()
    FOR profile IN [p1, p2, p3]:
        FOR charId IN profile.charIds:   // exactly 5
            IF seen.has(charId): RETURN false
            seen.add(charId)
    RETURN true   // 15 chars đều phân biệt
```

**Diễn giải:** 3 profiles × 5 nhân vật = 15. Tất cả 15 phải khác nhau.

---

## 4. Pha 2 — ILP Solver (GLPK WASM)

### 4.1 Tại sao ILP khả thi?

Bài toán có quy mô nhỏ:
- ~32 member × ~100–500 combo/member = **~3.200–16.000 biến nhị phân**
- 15 EngineBoss → 15 ràng buộc damage cap + 32 ràng buộc "≤1 combo/member"
- 2 gate variable (g₁, g₂) + ~20 level gate constraints

**Diễn giải:** GLPK giải bài toán này trong vài giây trên server Node.js (qua WASM).

### 4.2 Mô hình hoá ILP

**Biến quyết định:**

$$y_{m,c} \in \{0, 1\} \quad \forall m \in M,\ c \in C(m)$$

**Diễn giải:** Với mỗi thành viên và mỗi combo hợp lệ, tìm giá trị 0 hoặc 1 — 1 nghĩa là "chọn combo này".

$$e_b \in [0,\ HP(b)] \quad \forall b \in B_{fin}$$

> **Kỹ thuật linearization:** $e_b$ là **biến liên tục** (**không** phải hằng số). Trong mô hình ILP, hàm $\min(a, b)$ không tuyến tính nên không viết trực tiếp được. Thay vào đó, ta tạo biến $e_b$ với 2 ràng buộc upper bound ($e_b \leq HP$ và $e_b \leq \sum \text{dmg}$), kết hợp với hàm mục tiêu Maximize → solver sẽ tự đẩy $e_b$ lên giá trị cao nhất có thể, tức $\min(HP, \sum \text{dmg})$. Đây là kỹ thuật chuẩn trong Operations Research.

$$g_N \in \{0, 1\} \quad N \in \{1, 2\}$$

**Diễn giải:** Gate variable cho Level Gate constraint. $g_N = 1$ khi tất cả boss Level N đã bị kill.

**Ràng buộc:**

**(R1) Mỗi member tối đa 1 combo:**
$$\sum_{c \in C(m)} y_{m,c} \leq 1 \quad \forall m \in M$$

**Diễn giải:** Mỗi thành viên được chọn **tối đa 1 combo** (có thể không được chọn combo nào nếu tất cả boss accessible đã đủ damage).

> **Lưu ý:** Ràng buộc là $\leq 1$ (không phải $= 1$). Nếu solver quyết định member không cung cấp upside, sẽ không ép gán combo. Member không được gán sẽ có `combo: null` trong kết quả.

**(R2) Effective damage ≤ HP:**
$$e_b \leq HP(b) \quad \forall b \in B_{fin}$$

**(R3) Effective damage ≤ tổng damage được gán:**
$$e_b \leq \sum_{m \in M} \sum_{\substack{c \in C(m) \\ p_b(c)\ \text{exists}}} y_{m,c} \cdot dmg_{p_b(c)} \quad \forall b \in B_{fin}$$

**Diễn giải:** Effective damage cũng không thể lớn hơn tổng damage mà mọi người dồn vào boss đó. Kết hợp R2 + R3 + Maximize → solver tự tính $e_b = \min(HP(b),\ \text{tổng damage})$.

**(R4) Level Gate — Binary Gate Constraints:**

Đây là ràng buộc quan trọng nhất, đảm bảo **không ai được gây damage lên boss Level N+1 trước khi Level N được clear hoàn toàn**. Được mô hình hoá bằng binary gate variables:

Với mỗi level $N \in \{1, 2\}$ (gate cho Level 2 và 3):

**(R4a) Gate chỉ mở khi tất cả boss Level N bị kill:**
$$\forall b \in L_N: \quad g_N \cdot HP(b) - \sum_{\text{combos có profile nhắm }b} dmg \cdot y_{m,c} \leq 0$$

**Diễn giải:** Gate $g_N$ chỉ có thể =1 khi tổng damage trên mỗi boss Level N đều ≥ HP. Nếu bất kỳ boss nào thiếu damage → $g_N$ bị ép =0.

**(R4b) Damage lên Level N+1 bị giới hạn bởi gate:**
$$\forall b \in L_{N+1}: \quad \sum_{\text{combos có profile nhắm }b} dmg \cdot y_{m,c} - M \cdot g_N \leq 0$$

Trong đó $M$ = big-M (tổng max damage khả dụng trên boss đó).

**Diễn giải:** Nếu $g_N = 0$ (Level N chưa clear), không ai được gây damage lên bất kỳ boss nào ở Level N+1. Nếu $g_N = 1$ (Level N đã clear), ràng buộc tự giải phóng (vì $M$ đủ lớn).

> **So sánh với pre-filtering (phiên bản cũ):** Phiên bản v1 dùng Pha 0 để ước tính `deepest`, rồi loại combo nhắm level > deepest + 1. Phiên bản v2 **vẫn pre-filter** bằng Pha 0 nhưng bổ sung level gate constraint trong ILP để solver tự quyết định mở gate hay không — chính xác hơn vì Pha 0 chỉ là ước tính optimistic.

**Hàm mục tiêu:**
$$\max \sum_{b \in B_{fin}} e_b$$

### 4.3 Pseudocode (Implementation thực tế)

```
FUNCTION ilpSolve(memberCombos, bosses):

    timeouts = [30, 60, 120]   // seconds, retry escalation

    FOR attempt IN [0, 1, 2]:
        TRY:
            result = solveWithGLPK(memberCombos, bosses, timeouts[attempt])
            RETURN result
        CATCH err:
            glpkPromise = null   // Reset WASM singleton
            IF last attempt: THROW err

FUNCTION solveWithGLPK(memberCombos, bosses, tmlim):

    glpk = await loadGLPK()   // Lazy-loaded singleton

    // ── Index combos globally ──
    allCombos = flatten memberCombos into [{memberId, ci, combo}]

    // ── Build GLPK model ──

    // Objective: MAX Σ e_b
    objective.vars = bosses.map(b → {name: "e_{b.id}", coef: 1.0})

    // (1) Member constraint: Σ y[m,c] ≤ 1  ∀m
    FOR each (memberId, combos) in memberCombos:
        addConstraint(Σ y[m,c] ≤ 1)

    // (2) Boss damage: e_b - Σ dmg·y ≤ 0  ∀b
    bossDmgTerms = Map<bossId, terms[]>
    FOR each boss:
        vars = [{e_b, coef: 1.0}]
        FOR each (m, c) with profile targeting boss:
            vars.push({y[m,c], coef: -dmg})
            bossDmgTerms[boss].push({y[m,c], coef: dmg})
        addConstraint(vars ≤ 0)

    // (3) Level gate constraints
    gateBinaries = []
    FOR gateLevel IN [1, 2]:
        gateName = "g_{gateLevel}"
        gateBosses = bosses at level gateLevel
        nextBosses = bosses at level gateLevel+1

        IF gateBosses empty OR nextBosses empty: CONTINUE
        gateBinaries.push(gateName)

        // (a) Gate ≤ kill: g·HP - Σdmg·y ≤ 0  per boss in level
        FOR boss IN gateBosses:
            addConstraint(g·HP(b) - Σdmg·y ≤ 0)

        // (b) Access gate: Σdmg·y - M·g ≤ 0  per boss in next level
        FOR boss IN nextBosses:
            bigM = sum of all possible damage on boss
            addConstraint(Σdmg·y - bigM·g ≤ 0)

    // Bounds: e_b ∈ [0, HP(b)], y[m,c] ∈ [0,1], g ∈ [0,1]
    // Binaries: y[m,c], g

    // ── Solve ──
    result = glpk.solve(model, {msglev: GLP_MSG_ERR, tmlim, mipgap: 0.005})

    IF result.status NOT IN {OPTIMAL, FEASIBLE}:
        THROW error

    // ── Extract solution ──
    FOR each (memberId, combos) in memberCombos:
        chosen = first combo where round(y[m,c]) == 1
        entries.push({memberId, combo: chosen or null})

    RETURN entries
```

### 4.4 Cấu hình GLPK

| Tham số | Giá trị | Ý nghĩa |
|---------|---------|---------|
| `msglev` | `GLP_MSG_ERR` | Chỉ hiển thị lỗi (giảm log noise) |
| `tmlim` | 30 → 60 → 120s | Timeout escalation |
| `mipgap` | 0.005 (0.5%) | Chấp nhận solution gần optimal (gap < 0.5%) |

### 4.5 Công nghệ Solver

| Solver | Platform | Status |
|--------|----------|--------|
| **GLPK.js** (`glpk.js/node`) | WASM — chạy server-side (Node.js) | ✅ **Đang dùng** |
| HiGHS (`highs`) | WASM — browser/Node | ❌ Đã bỏ (crash trên model lớn) |

> GLPK.js được đánh dấu `serverExternalPackages` trong `next.config.ts` để Turbopack không bundle. Import path: `glpk.js/node`.

---

## 5. Pha 3 — Kiểm tra & Xuất kết quả

### 5.1 Tính tổng kết quả

Sau khi ILP solver trả về danh sách `entries` (mỗi member + combo hoặc null):

```
allocated = Map<bossId, totalDamage>

FOR entry IN entries:
    IF entry.combo is null: CONTINUE
    FOR profile IN entry.combo.profiles:
        allocated[profile.bossId] += profile.damage

bossDamage = bosses.map(b → {
    allocatedDamage: allocated[b.id],
    effectiveDamage: min(allocated[b.id], b.hp),
    hp: b.hp,
    overkill: max(0, allocated[b.id] - b.hp),
})

totalEffectiveDamage = Σ bossDamage.effectiveDamage
```

### 5.2 Validate Level Gate

Sau khi tính allocated damage, engine validate lại level gate thực tế:

```
FUNCTION validateLevelGate(allocated, bosses):
    cleared = 0
    FOR level IN [1, 2, 3]:
        levelBosses = bosses at level
        IF ALL levelBosses satisfy (allocated[b.id] ≥ b.hp):
            cleared = level
        ELSE:
            BREAK
    RETURN cleared
```

### 5.3 Cảnh báo (Warnings)

Engine tự động tạo warnings cho các trường hợp:

| Trường hợp | Warning |
|-------------|---------|
| Union chưa đủ lực clear Level 1 | "Ước tính: Union chưa đủ lực clear Level 1" |
| Boss thiếu damage để kill | "Boss X Level Y: thiếu ~Z damage" |
| Level gate violation (cross-level) | "Level N chưa clear nhưng có damage trên Level N+1" |
| Boss không có ai đánh | "Boss X Level Y: không có ai được phân công đánh" |
| Member không có combo hợp lệ | "MemberName: không có combo hợp lệ" |

### 5.4 Giao diện kết quả (Web UI)

Kết quả phân công được hiển thị trên trang `/raids/[raidId]/assignments/[assignmentId]`:

**Bảng phân công chính** — mỗi dòng = 1 thành viên, hiển thị 3 profile:

| Thành viên | Lượt 1 | Lượt 2 | Lượt 3 | Tổng DMG |
|-----------|--------|--------|--------|----------|
| KYLRIES | S1-Water L1 (5 chars) | S3-Wind L2 (5 chars) | S5-Electric L3 (5 chars) | 18.50B |
| UNKNOWN | S2-Fire L1 (5 chars) | S4-Iron L2 (5 chars) | S1-Water L3 (5 chars) | 15.20B |

**Thống kê boss:** Bảng tổng hợp damage per boss với thanh tiến trình visual (allocated vs HP, overkill).

---

## 6. Data Flow — Từ DB đến Engine

Quy trình chuyển đổi dữ liệu quan trọng nhất nằm ở API route `POST /api/optimize`:

```
 BossSlot (5 rows)          EngineProfile (N×3)
┌────────────────┐         ┌──────────────────┐
│ slot=1         │ expand  │ ep_id=0: slot1,L1│
│ hpLevel1       │ ──────► │ ep_id=1: slot1,L2│
│ hpLevel2       │         │ ep_id=2: slot1,L3│
│ hpLevel3       │         └──────────────────┘
└────────────────┘
   5 BossSlots × 3 levels = 15 EngineBoss

 DB Profile (1 row)         EngineProfile (3 rows)
┌────────────────┐         ┌──────────────────┐
│ memberId       │ expand  │ profile@L1       │
│ bossSlotId     │ ──────► │ profile@L2       │
│ damage         │         │ profile@L3       │
│ char1..5Id     │         │ (same damage)    │
└────────────────┘         └──────────────────┘
   Mỗi DB profile → 3 synthetic EngineProfile (1 per level)
```

**reverseMap:** Sau khi engine trả kết quả, API sử dụng reverse map để convert synthetic IDs → real DB profile IDs + assigned levels, rồi lưu vào `AssignmentEntry`.

---

## 7. Các hệ số có thể chỉnh (Tunable Parameters)

| Tham số | Ý nghĩa | Giá trị mặc định | Code |
|---------|---------|-------------------|------|
| `topK` | Profile/boss giữ lại cho combo builder | 3 | `combo_builder.ts` |
| `MAX_COMBOS_PER_MEMBER` | Cap số combo mỗi member | 500 | `combo_builder.ts` |
| `timeouts` | Retry timeout escalation | [30, 60, 120]s | `ilp_solver.ts` |
| `mipgap` | MIP gap tolerance | 0.005 (0.5%) | `ilp_solver.ts` |

---

## 8. Edge Cases

| # | Trường hợp | Xử lý |
|---|-----------|-------|
| E1 | Member không tạo được combo hợp lệ nào ($C(m) = \emptyset$) | Warning: "không có combo hợp lệ (cần ít nhất 3 boss có profile + đội hình không trùng nhân vật)" |
| E2 | Member chưa có profile nào | Bỏ qua — có thể là Finisher/Cleaner do Leader giữ riêng |
| E3 | Combo không bao phủ hết 5 boss | **Không cảnh báo** — bình thường |
| E4 | Boss không có ai nhắm tới | Warning: "không có ai được phân công đánh" |
| E5 | Tổng damage < HP toàn bộ boss level 1 | Warning: "Union chưa đủ lực clear Level 1" |
| E6 | Damage > MAX_SAFE_INTEGER | Throw error hoặc skip profile (validate trước khi convert BigInt→Number) |
| E7 | GLPK WASM crash | Reset singleton, retry với timeout lớn hơn (3 lần) |
| E8 | ILP infeasible | Throw error: "GLPK status: X (not optimal/feasible)" |
| E9 | Cross-level combo gây level gate violation | Warning nhưng vẫn chấp nhận (solver tự cân bằng) |
