# Solution Design Document

---

## 1. Algorithm Overview

The tool uses **ILP (Integer Linear Programming)** to solve the attack assignment problem. The solver runs server-side via **GLPK.js (WASM)**.

| Characteristic | Detail |
|----------------|--------|
| **Solver** | GLPK.js (GNU Linear Programming Kit — WASM, runs on server-side Node.js) |
| **Solution Quality** | Exact optimal |
| **Runtime** | 1–10 seconds (32 members × 5 bosses) |
| **Retry** | 3 attempts: timeout 30s → 60s → 120s, WASM singleton reset between attempts |

> **Historical note:** Version 1 used HiGHS WASM. However, HiGHS WASM encountered a `null function or function signature mismatch` error on models with > 1000 binary vars. Switched to GLPK.js from v2.0.

The pipeline consists of 4 phases:

```
┌─────────────────────────────────────┐
│  Phase 0: Feasibility Analysis      │  ← Determine deepest clearable level
│  Input: Total available dmg + HP(b) │
│  Output: deepest, maxAccessibleLevel│
├─────────────────────────────────────┤
│  Phase 1: Build Valid Combos        │  ← Pre-processing
│  Input: Profiles from mock battles  │
│  Output: C(m) for each member       │
│  Filter: top-K per boss, max 500    │
├─────────────────────────────────────┤
│  Phase 2: ILP Solver (GLPK WASM)   │  ← Exact optimization
│  Input: C(m) + HP(b) + Level Gate  │
│  Output: y(m,c) = selected combo   │
├─────────────────────────────────────┤
│  Phase 3: Check & Output Results   │  ← Post-processing + validate
│  Input: Assignment result          │
│  Output: Assignment schedule + warnings │
└─────────────────────────────────────┘
```

---

## 2. Phase 0 — Feasibility Analysis

Before anything else, the engine determines **how many levels the Union can clear** based on total available damage.

### 2.1 Estimate Maximum Total Damage

For each boss $b$, the available total damage is estimated as:

$$\text{maxDMG}(b) = \sum_{m \in M} \max_{p \in P(m),\ b_p = b} dmg_p$$

**Interpretation:** For each boss, take the **best mock result from each member** and sum them. This is an **optimistic upper bound** — it assumes everyone can use their best team for that boss (in practice, character locks from combo constraints may prevent this).

### 2.2 Determine Scenario

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
            BREAK    // Cannot pass this level

    RETURN deepest
```

### 2.3 Strategy by Scenario

- `maxAccessibleLevel = min(deepest + 1, 3)`
- Profiles targeting bosses at levels > `maxAccessibleLevel` are **filtered out before building combos**.

| `deepest` | maxAccessible | Strategy |
|-----------|---------------|----------|
| 3 | 3 | Kill all L1→L2→L3, minimize overkill |
| 2 | 3 | Kill L1→L2, maximize effective dmg on L3 |
| 1 | 2 | Kill L1, maximize effective dmg on L2 |
| 0 | 1 | Maximize effective dmg on L1 |

> **Note:** maxAccessibleLevel = deepest + 1 (capped at 3). Profiles for levels > maxAccessibleLevel are filtered out before combo building in Phase 1.

---

## 3. Phase 1 — Build Valid Combos

### 3.1 Input
The set of profiles for each member $m$, each profile:
$$p = (m,\ b,\ \text{chars}_p,\ dmg_p)$$

**Note on the data model:** In the codebase, each `BossSlot` stores HP for all 3 levels (hpLevel1, hpLevel2, hpLevel3). The API route `/api/optimize` **expands** each DB profile into 3 EngineProfiles (1 profile × 3 levels = 3 synthetic profiles), creating a map of 15 "EngineBosses" (5 slots × 3 levels) from 5 BossSlots.

### 3.2 Algorithm

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
            C(m) = []    // Need at least 3 distinct bosses
            CONTINUE

        combos = []

        // Enumerate C(n, 3) boss triples
        FOR (i, j, k) in C(n, 3):
            FOR pa in bossEntries[i].profiles:
                FOR pb in bossEntries[j].profiles:
                    FOR pc in bossEntries[k].profiles:
                        IF charsAreUnique(pa, pb, pc):
                            combos.add({pa, pb, pc})

        // Cap: keep only top 500 combos (by rawDamage desc)
        IF combos.length > 500:
            combos.sortByRawDamageDesc()
            combos.truncate(500)

        C(m) = combos
```

### 3.3 Practical Limits

| Parameter | Value | Reason |
|-----------|-------|--------|
| `topK` | 3 | Keep only the top 3 profiles per member per boss → reduce combo explosion |
| `MAX_COMBOS_PER_MEMBER` | 500 | Prevent the ILP model from growing too large. Combo #501+ is suboptimal |

### 3.4 Character Overlap Check

```
FUNCTION charsAreUnique(p1, p2, p3) → boolean:
    seen = Set<number>()
    FOR profile IN [p1, p2, p3]:
        FOR charId IN profile.charIds:   // exactly 5
            IF seen.has(charId): RETURN false
            seen.add(charId)
    RETURN true   // all 15 chars are distinct
```

**Interpretation:** 3 profiles × 5 characters = 15. All 15 must be unique.

---

## 4. Phase 2 — ILP Solver (GLPK WASM)

### 4.1 Why is ILP Feasible?

The problem is small in scale:
- ~32 members × ~100–500 combos/member = **~3,200–16,000 binary variables**
- 15 EngineBosses → 15 damage cap constraints + 32 "≤1 combo/member" constraints
- 2 gate variables (g₁, g₂) + ~20 level gate constraints

**Interpretation:** GLPK solves this problem in a few seconds on a Node.js server (via WASM).

### 4.2 ILP Formulation

**Decision variables:**

$$y_{m,c} \in \{0, 1\} \quad \forall m \in M,\ c \in C(m)$$

**Interpretation:** For each member and each valid combo, find the value 0 or 1 — 1 means "select this combo."

$$e_b \in [0,\ HP(b)] \quad \forall b \in B_{fin}$$

> **Linearization technique:** $e_b$ is a **continuous variable** (**not** a constant). In ILP formulations, the $\min(a, b)$ function is non-linear and cannot be written directly. Instead, we create variable $e_b$ with 2 upper bound constraints ($e_b \leq HP$ and $e_b \leq \sum \text{dmg}$), combined with the Maximize objective → the solver will automatically push $e_b$ to the highest possible value, i.e., $\min(HP, \sum \text{dmg})$. This is a standard technique in Operations Research.

$$g_N \in \{0, 1\} \quad N \in \{1, 2\}$$

**Interpretation:** Gate variable for the Level Gate constraint. $g_N = 1$ when all Level N bosses have been killed.

**Constraints:**

**(R1) Each member selects at most 1 combo:**
$$\sum_{c \in C(m)} y_{m,c} \leq 1 \quad \forall m \in M$$

**Interpretation:** Each member is assigned **at most 1 combo** (may receive no combo if all accessible bosses already have sufficient damage).

> **Note:** The constraint is $\leq 1$ (not $= 1$). If the solver decides a member provides no upside, it will not force a combo assignment. Members with no assigned combo will have `combo: null` in the result.

**(R2) Effective damage ≤ HP:**
$$e_b \leq HP(b) \quad \forall b \in B_{fin}$$

**(R3) Effective damage ≤ total assigned damage:**
$$e_b \leq \sum_{m \in M} \sum_{\substack{c \in C(m) \\ p_b(c)\ \text{exists}}} y_{m,c} \cdot dmg_{p_b(c)} \quad \forall b \in B_{fin}$$

**Interpretation:** Effective damage also cannot exceed the total damage everyone deals to that boss. Combining R2 + R3 + Maximize → the solver automatically computes $e_b = \min(HP(b),\ \text{total damage})$.

**(R4) Level Gate — Binary Gate Constraints:**

This is the most important constraint, ensuring **no one may deal damage to a Level N+1 boss before Level N is fully cleared**. Modeled using binary gate variables:

For each level $N \in \{1, 2\}$ (gates for Levels 2 and 3):

**(R4a) Gate only opens when all Level N bosses are killed:**
$$\forall b \in L_N: \quad g_N \cdot HP(b) - \sum_{\text{combos with profile targeting }b} dmg \cdot y_{m,c} \leq 0$$

**Interpretation:** Gate $g_N$ can only equal 1 when the total damage on every Level N boss is ≥ HP. If any boss has insufficient damage → $g_N$ is forced to 0.

**(R4b) Damage to Level N+1 is gated:**
$$\forall b \in L_{N+1}: \quad \sum_{\text{combos with profile targeting }b} dmg \cdot y_{m,c} - M \cdot g_N \leq 0$$

Where $M$ = big-M (total maximum damage available for that boss).

**Interpretation:** If $g_N = 0$ (Level N not yet cleared), no one may deal damage to any Level N+1 boss. If $g_N = 1$ (Level N cleared), the constraint is released (since M is large enough).

> **Comparison with pre-filtering (old version):** Version v1 used Phase 0 to estimate `deepest`, then filtered out combos targeting levels > deepest + 1. Version v2 **still pre-filters** using Phase 0 but adds the level gate constraint inside the ILP so the solver can self-determine whether to open the gate — more accurate, since Phase 0 is only an optimistic estimate.

**Objective function:**
$$\max \sum_{b \in B_{fin}} e_b$$

### 4.3 Pseudocode (Actual Implementation)

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

### 4.4 GLPK Configuration

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `msglev` | `GLP_MSG_ERR` | Only display errors (reduce log noise) |
| `tmlim` | 30 → 60 → 120s | Timeout escalation |
| `mipgap` | 0.005 (0.5%) | Accept near-optimal solutions (gap < 0.5%) |

### 4.5 Solver Technology

| Solver | Platform | Status |
|--------|----------|--------|
| **GLPK.js** (`glpk.js/node`) | WASM — runs server-side (Node.js) | ✅ **Currently in use** |
| HiGHS (`highs`) | WASM — browser/Node | ❌ Removed (crashes on large models) |

> GLPK.js is marked as `serverExternalPackages` in `next.config.ts` so Turbopack does not bundle it. Import path: `glpk.js/node`.

---

## 5. Phase 3 — Check & Output Results

### 5.1 Compute Summary Statistics

After the ILP solver returns the list of `entries` (each member + combo or null):

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

After computing allocated damage, the engine re-validates the actual level gate:

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

### 5.3 Warnings

The engine automatically generates warnings for the following cases:

| Condition | Warning |
|-----------|---------|
| Union not strong enough to clear Level 1 | "Estimate: Union is not strong enough to clear Level 1" |
| Boss has insufficient damage to kill | "Boss X Level Y: missing ~Z damage" |
| Level gate violation (cross-level) | "Level N not yet cleared but damage exists on Level N+1" |
| Boss has no one assigned | "Boss X Level Y: no one has been assigned to attack" |
| Member has no valid combo | "MemberName: no valid combo available" |

### 5.4 Web UI Results

The assignment results are displayed on the page `/raids/[raidId]/assignments/[assignmentId]`:

**Main assignment table** — each row = 1 member, displaying 3 profiles:

| Member | Attack 1 | Attack 2 | Attack 3 | Total DMG |
|--------|----------|----------|----------|-----------|
| KYLRIES | S1-Water L1 (5 chars) | S3-Wind L2 (5 chars) | S5-Electric L3 (5 chars) | 18.50B |
| UNKNOWN | S2-Fire L1 (5 chars) | S4-Iron L2 (5 chars) | S1-Water L3 (5 chars) | 15.20B |

**Boss statistics:** A summary table of damage per boss with a visual progress bar (allocated vs HP, overkill).

---

## 6. Data Flow — From DB to Engine

The most important data transformation lives in the API route `POST /api/optimize`:

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
   Each DB profile → 3 synthetic EngineProfiles (1 per level)
```

**reverseMap:** After the engine returns its results, the API uses a reverse map to convert synthetic IDs → real DB profile IDs + assigned levels, then saves them to `AssignmentEntry`.

---

## 7. Tunable Parameters

| Parameter | Meaning | Default Value | Code Location |
|-----------|---------|---------------|---------------|
| `topK` | Profiles/boss kept for combo builder | 3 | `combo_builder.ts` |
| `MAX_COMBOS_PER_MEMBER` | Cap on combos per member | 500 | `combo_builder.ts` |
| `timeouts` | Retry timeout escalation | [30, 60, 120]s | `ilp_solver.ts` |
| `mipgap` | MIP gap tolerance | 0.005 (0.5%) | `ilp_solver.ts` |

---

## 8. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E1 | Member cannot form any valid combo ($C(m) = \emptyset$) | Warning: "no valid combo (need at least 3 bosses with profiles + non-overlapping characters)" |
| E2 | Member has no profiles at all | Skipped — may be a Finisher/Cleaner held aside by the Leader |
| E3 | Combo does not cover all 5 bosses | **No warning** — this is normal |
| E4 | Boss has no one targeting it | Warning: "no one has been assigned to attack" |
| E5 | Total damage < HP for all Level 1 bosses | Warning: "Union is not strong enough to clear Level 1" |
| E6 | Damage > MAX_SAFE_INTEGER | Throw error or skip profile (validate before BigInt→Number conversion) |
| E7 | GLPK WASM crash | Reset singleton, retry with longer timeout (3 attempts) |
| E8 | ILP infeasible | Throw error: "GLPK status: X (not optimal/feasible)" |
| E9 | Cross-level combo causes level gate violation | Warning but still accepted (solver self-balances) |
