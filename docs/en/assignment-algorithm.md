# Union Raid Attack Assignment Algorithm

This document provides a detailed description of the optimization algorithm for Union Raid attack assignments in the game NIKKE: Goddess of Victory. The engine is implemented in the `engine/` directory and invoked via the API endpoint `POST /api/optimize`.

---

## 1. Problem Context

### 1.1. Union Raid Rules

In Union Raid, a Union (clan) collaborates to attack **5 bosses** each season. Each boss has 3 HP values corresponding to 3 levels. To unlock the next Level, the Union must eliminate **all** 5 bosses at the current level.

Each Union member has **3 attacks per day**. In each attack, the member uses a team of **5 characters** to attack **1 specific boss**. The key constraint is that **no character may be reused** across different attacks on the same day — meaning the 15 characters across 3 attacks must all be completely distinct.

### 1.2. Optimization Objective

The problem: **Assign attacks for all members to maximize total effective damage**, while satisfying the following constraints:

1. Each member selects exactly **1 combo** (3 teams attacking 3 bosses, with 15 distinct characters in total), or receives no assignment.
2. Effective damage on each boss is **capped at HP** (damage beyond HP is overkill and does not count toward the objective).
3. Must comply with the **Level Gate** — bosses at level N+1 may only be attacked after level N is fully cleared.

### 1.3. Input Data

| Entity | Description |
|--------|-------------|
| **BossSlot** | 5 bosses, each with 3 level HP values (`hpLevel1`, `hpLevel2`, `hpLevel3`) → 15 total "engine bosses" |
| **Profile** | Mock battle result: member X uses a team of 5 characters to attack boss Y, dealing damage Z |
| **Member** | Only considers members with the `regular` role (finishers/cleaners are assigned manually by the Union Leader) |

Each DB Profile (targeting 1 BossSlot) is replicated into 3 EngineProfiles for the 3 levels, because the same team attacking the same boss at different levels deals the same damage — only the boss HP differs.

---

## 2. Engine Architecture

The engine operates as a sequential 4-phase pipeline:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Phase 0   │────▶│   Phase 1    │────▶│   Phase 2   │────▶│    Phase 3      │
│ Feasibility │     │ Combo Builder│     │ ILP Solver  │     │ Post-processing │
│  Analysis   │     │              │     │  (GLPK)     │     │  & Validation   │
└─────────────┘     └──────────────┘     └─────────────┘     └─────────────────┘
```

### Source files

| File | Role |
|------|------|
| `engine/index.ts` | Orchestrator: coordinates 4 phases, aggregates results |
| `engine/combo_builder.ts` | Phase 1: generates valid combo sets for each member |
| `engine/ilp_solver.ts` | Phase 2: solves the ILP problem using GLPK WASM |
| `engine/types.ts` | Shared type definitions |
| `app/api/optimize/route.ts` | API layer: converts DB data → Engine → saves results |

---

## 3. Phase 0 — Feasibility Analysis

**Purpose:** Estimate the maximum level the Union can clear, thereby constraining the problem space.

### Algorithm

```
function determineScenario(profiles, bosses):
    For each (member, boss), take the best max damage
    For each boss, sum the max damage from all members
    
    deepest = 0
    for level = 1 → 3:
        if every boss at this level has total damage ≥ HP:
            deepest = level
        else:
            break
    
    return deepest
```

**Variable meanings:**
- `deepest`: The highest level the Union can *certainly* clear (optimistic estimate — does not account for character overlap constraints)
- `maxAccessibleLevel = min(deepest + 1, 3)`: The highest level members *may* attack (levels beyond this are excluded from the problem)

**Example:** If `deepest = 2`, the Union can clear Levels 1 and 2. Members will be assigned to attack bosses at Levels 1, 2, and 3. Level 3 bosses will only receive damage, not necessarily be killed.

### Filtering Profiles by Level

After Phase 0, all profiles targeting bosses at levels > `maxAccessibleLevel` are removed. This significantly reduces the number of combos in Phase 1.

---

## 4. Phase 1 — Combo Builder

**Purpose:** For each member, generate all valid combos (3 teams × 3 bosses, 15 non-duplicate characters).

**File:** `engine/combo_builder.ts`

### 4.1. Data Structure

```
EngineCombo {
    memberId: number
    profiles: [Profile, Profile, Profile]   // 3 profiles, each attacking a different boss
    rawDamage: number                       // Total raw damage (before HP cap)
}
```

### 4.2. Algorithm

```
function buildCombos(profiles, topK=3):
    1. Group profiles by memberId → bossId
    
    2. For each member:
        a. For each boss, keep the top-K profiles (sorted by damage descending)
           → Pruning: keep only K=3 best profiles per (member, boss) pair
        
        b. Enumerate all C(n, 3) boss triples
           (n = number of bosses the member has profiles for)
        
        c. For each boss triple (A, B, C):
            - Try all combinations: 1 profile from boss A × 1 from boss B × 1 from boss C
            - Check: the total 15 characters (5×3) must all be distinct
            - If valid → add to the combo list
        
        d. If combo count > 500 → sort by rawDamage descending, keep top 500
    
    return Map<memberId, EngineCombo[]>
```

### 4.3. Character Uniqueness Check

```
function charsAreUnique(p1, p2, p3):
    seen = Set()
    for profile in [p1, p2, p3]:
        for charId in profile.charIds:    // 5 characters per profile
            if charId in seen: return false
            seen.add(charId)
    return true    // all 15 IDs are distinct
```

### 4.4. Complexity

Assuming a member has profiles for `n` bosses, keeping `K` profiles per boss:

- Boss triples: `C(n, 3)`
- Per triple: `K³` profile combinations
- Total: `C(n, 3) × K³`

With `n = 15` (5 bosses × 3 levels), `K = 3`: `C(15, 3) × 27 = 455 × 27 = 12,285` combinations/member.

The `MAX_COMBOS_PER_MEMBER = 500` cap ensures the ILP solver is not overloaded.

---

## 5. Phase 2 — ILP Solver (GLPK WASM)

**Purpose:** Find the optimal combo assignment for the entire Union using Integer Linear Programming.

**File:** `engine/ilp_solver.ts`

**Solver:** GLPK (GNU Linear Programming Kit), running as a WebAssembly module on the server.

### 5.1. Mathematical Model

#### Decision Variables

| Variable | Domain | Meaning |
|----------|--------|---------|
| `y[m,c]` | `{0, 1}` | Whether member `m` is assigned combo `c` |
| `e[b]` | `[0, HP_b]` | Effective damage dealt to boss `b` (capped at HP) |
| `g[N]` | `{0, 1}` | Level Gate: 1 if all bosses at level `N` have been eliminated |

#### Objective Function

```
Maximize  Z = Σ_b  e[b]
```

Maximize the total effective damage across all bosses (capped at HP).

#### Constraints

**(C1) Each member selects at most 1 combo:**

```
Σ_c  y[m,c]  ≤  1     ∀ member m
```

**(C2) Effective damage ≤ actual damage dealt:**

```
e[b]  ≤  Σ_{(m,c): b ∈ combo c}  damage(m, b, c) · y[m,c]     ∀ boss b
```

Where `damage(m, b, c)` is the damage member `m` deals to boss `b` in combo `c`.

**(C3) Effective damage ≤ boss HP (cap):**

```
e[b]  ≤  HP[b]     ∀ boss b
```

This constraint is encoded via the upper bound of variable `e[b]`.

**(C4) Level Gate — Gate variable:**

For each level `N ∈ {1, 2}`:

**Gate only opens when all level N bosses are killed:**
```
g[N] · HP[b]  ≤  Σ damage · y[m,c]     ∀ boss b ∈ Level N
```
(Rearranged: `g[N] · HP[b] - Σ damage·y ≤ 0`)

**Damage to level N+1 is gated by g[N]:**
```
Σ damage · y[m,c]  ≤  M · g[N]     ∀ boss b ∈ Level N+1
```

Where `M` (big-M) = the total maximum damage that can be dealt to that boss (a sufficiently large upper bound).

### 5.2. Numerical Stability (Numerical Scaling)

GLPK WASM encounters numerical instability issues when coefficients are in the range `10^10` ~ `10^12` (damage values in NIKKE). The engine divides all damage and HP values by a `SCALE = 1,000,000` factor before passing them to the model.

```typescript
const SCALE = 1_000_000;
// Damage coefficient: profile.damage / SCALE
// HP bound:           boss.hp / SCALE
```

Uniform scaling does not affect the optimal solution (the binary `y` variables remain unchanged).

### 5.3. Solver Parameters

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `msglev` | `GLP_MSG_ERR` | Only print error messages |
| `tmlim` | 30 → 60 → 120s | Timeout (escalated on retry) |
| `mipgap` | 0.005 (0.5%) | Accept a solution if the gap ≤ 0.5% from optimal |

### 5.4. Retry Mechanism

```
timeouts = [30s, 60s, 120s]

for each attempt:
    try:
        solve with timeout
        return result
    catch:
        reset GLPK WASM singleton (prevent WASM corruption)
        retry with longer timeout

throw error after 3 failures
```

### 5.5. Extracting the Solution

```
for each member m:
    for each combo c of member m:
        if y[m,c] ≈ 1 (round):
            assign combo c to member m
            break
```

---

## 6. Phase 3 — Post-processing & Validation

**Purpose:** Compute statistics, validate the solution, generate warnings.

### 6.1. Aggregate Damage

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
        if every boss at this level has allocated ≥ HP:
            cleared = level
        else:
            break
    return cleared
```

Compare `actualCleared` with `maxAccessibleLevel` to detect cases where Phase 0's estimate was overly optimistic.

### 6.3. Automatic Warnings

The engine generates the following warnings:

| Warning | Condition |
|---------|-----------|
| Member has no valid combo | `combos.length === 0` — missing profiles or character overlap across bosses |
| Boss has insufficient damage | `allocated < HP` at levels ≤ `actualCleared + 1` |
| Level Gate violation | Damage exists on level N+1 but level N is not cleared |
| Boss has no one assigned | `allocatedDamage === 0` for a boss within the accessible range |
| Union not strong enough | `deepest === 0` — estimate shows Level 1 cannot be cleared |

---

## 7. API → Engine → DB Data Flow

```
POST /api/optimize { raidId }
│
├─ 1. Load from DB: Raid + BossSlots + Profiles + Members(regular)
│
├─ 2. Data transformation:
│     BossSlot (5 slots) × 3 levels = 15 EngineBoss
│     Profile × 3 levels = 3N EngineProfile
│     (N = number of original profiles)
│
├─ 3. Call optimize(profiles, bosses, members)
│     → Phase 0 → Phase 1 → Phase 2 → Phase 3
│     → OptimizationResult
│
├─ 4. Save results to DB:
│     Assignment (metadata, scenario number, params JSON)
│     └── AssignmentEntry[] (for each member: 3 profileId + 3 level)
│
└─ 5. Return JSON response
```

### Reverse Mapping

The engine uses synthetic IDs for profiles (each DB profile is replicated 3 times for 3 levels). After the solver returns its results, the API layer uses a `reverseMap` for inverse mapping:

```
synthetic profile ID → { originalProfileId, level }
```

Used to populate `AssignmentEntry`:
- `profile1Id`, `profile2Id`, `profile3Id` = original profiles in the DB
- `level1`, `level2`, `level3` = the level that profile is assigned to attack

---

## 8. Illustrative Example

### Problem Setup

- **Union**: 3 members (A, B, C)
- **Bosses**: 2 bosses (Fire, Water), each with 2 levels
- **Boss HP**: Level 1 = 100M, Level 2 = 200M

### Submitted Profiles

| Member | Boss | Team | Damage |
|--------|------|------|--------|
| A | Fire | {Char1, Char2, Char3, Char4, Char5} | 60M |
| A | Water | {Char6, Char7, Char8, Char9, Char10} | 50M |
| A | Fire | {Char11, Char12, Char3, Char4, Char5} | 55M |
| B | Fire | {Char1, Char13, Char14, Char15, Char16} | 45M |
| B | Water | {Char6, Char17, Char18, Char19, Char20} | 70M |
| C | Fire | {Char2, Char21, Char22, Char23, Char24} | 40M |
| C | Water | {Char7, Char25, Char26, Char27, Char28} | 35M |

### Process

1. **Phase 0:** Total max damage for Fire = 60+45+40 = 145M ≥ 100M ✓. For Water = 50+70+35 = 155M ≥ 100M ✓. `deepest = 1`, `maxAccessibleLevel = 2`.

2. **Phase 1:** Build combos for each member (3 teams attacking 3 different bosses). In this simplified 2-boss example, there aren't enough bosses for a combo — in the actual game there are 5 bosses × 3 levels = 15 "engine bosses."

3. **Phase 2:** ILP solver finds the globally optimal assignment, balancing:
   - Damage cap at HP ↔ Avoid overkill
   - Level Gate ↔ Prioritize clearing lower levels first
   - No character overlap ↔ Already handled in Phase 1

4. **Phase 3:** Aggregate results, compute overkill, generate warnings.

---

## 9. Limitations & Technical Notes

### 9.1. Limitations

| Limitation | Details |
|------------|---------|
| Top-K pruning | Only keeps the 3 best profiles per (member, boss) → may miss optimal combos if a weaker profile enables a globally better combo |
| Combo cap | Maximum 500 combos/member → solution is not guaranteed to be absolutely optimal |
| Numerical precision | GLPK WASM uses floating-point. Scaling reduces but does not eliminate rounding errors |
| Uniform damage across levels | Damage does not change by boss level (same team → same damage). In practice the game may have slight differences |
| MIP gap | Accepts solutions within 0.5% of optimal → not always absolutely optimal |
| Only optimizes `regular` members | Finishers/cleaners are manually assigned by the Union Leader |

### 9.2. Error Handling

- **BigInt → Number**: HP and damage in the DB are stored as `BigInt`. Converted to `Number` before passing to the solver. Safe up to ~9×10¹⁵ (`Number.MAX_SAFE_INTEGER`).
- **SCALE = 1,000,000**: Reduces coefficients from 10¹⁰~10¹² down to 10⁴~10⁶ for stable GLPK processing.

### 9.3. Performance

| Metric | Typical Value |
|--------|--------------|
| Combo build time | < 100ms (30 members) |
| ILP solve time | 1–30s (depending on model size) |
| Total pipeline | 2–35s |
| Binary variables | ~`30 × 500` = 15,000 `y` vars + 15 `e` vars + 2 gate vars |
| Constraints | ~30 member + 15 boss damage + 5~10 gate ≈ 50–55 constraints |

---

## 10. Glossary

| Term | Explanation |
|------|-------------|
| **Combo** | A set of 3 profiles (3 teams attacking 3 bosses) for 1 member, with no character overlap |
| **Profile** | Mock battle result: a team of 5 characters + damage against 1 boss |
| **Effective Damage** | `min(allocated_damage, boss_HP)` — damage that is actually useful |
| **Overkill** | `max(0, allocated_damage - boss_HP)` — excess, wasted damage |
| **Level Gate** | Constraint: must clear all level N bosses before attacking level N+1 |
| **ILP** | Integer Linear Programming |
| **GLPK** | GNU Linear Programming Kit — open-source LP/MIP solver |
| **Big-M** | "Big-M method" technique in MIP: uses a sufficiently large constant to model logical (if-then) constraints |
| **MIP Gap** | The gap between the current solution and the theoretical optimal upper bound |
| **Scaling** | Dividing coefficients by 10⁶ to prevent numerical instability in the solver |
