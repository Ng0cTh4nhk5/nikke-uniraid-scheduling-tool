# Assumptions & Limitations



This document consolidates all **intentionally accepted assumptions** and **known technical limitations** that remain unresolved in the system. Its purpose is to help Union Leaders and developers understand the confidence boundaries of the tool's output, and to know what the tool **does not** handle.

---

## Section 1 — Accepted Assumptions

These are things the system **treats as true** without being able to verify, accepted for practical or technical reasons.

### A1 — Mock Battle Damage Accurately Reflects Real Combat Damage

| | |
|---|---|
| **Assumption** | The damage result from a mock battle is accurate and consistent. The team used in the mock battle will deal the same damage in the actual fight. |

### A2 — Damage is Uniform Across Levels

| | |
|---|---|
| **Assumption** | A given team composition deals the same damage regardless of whether the boss is at Level 1, 2, or 3. Only the boss HP differs. |

### A3 — All Members Execute the Assignment Schedule Correctly

| | |
|---|---|
| **Assumption** | After the assignment schedule is distributed, every member attacks the correct boss, with the correct team, in the correct order. |

### A4 — Intra-Day Attack Order Is Not Optimized

| | |
|---|---|
| **Assumption** | The 24-hour Hard Mode window is sufficient for all members to complete their attacks. The tool does not need to schedule precise attack times. |
| **Status** | ⚠️ The `execOrder` field in `AssignmentEntry` is designed to hold execution wave order, but **the engine does not populate it automatically** (currently set to null). |

### A5 — Level 2/3 Profiles Are Submitted During Hard Mode

| | |
|---|---|
| **Assumption** | Members can only mock battle Level N bosses after Level N is unlocked in Hard Mode. Therefore, Level 2/3 profile data is typically submitted after Hard Mode has already opened. |

### A6 — Damage Values Are Below MAX_SAFE_INTEGER

| | |
|---|---|
| **Assumption** | All damage values are less than `Number.MAX_SAFE_INTEGER` ≈ 9×10¹⁵. |

---

## Section 2 — Technical Limitations

These are issues that are **well understood** but accepted due to performance / complexity trade-offs.

### L1 — Top-K Pruning May Miss the Optimal Combo

| | |
|---|---|
| **Description** | The Combo Builder retains only the **top 3 profiles** for each (member, boss) pair. Lower-damage profiles are discarded. |
| **Consequence** | A "weak" profile (lower damage against boss X) that uses a non-overlapping team with the other 2 profiles could form a globally better combo — but it will be pruned away. |
| **Trade-off** | Keeping more profiles (topK > 3) causes combo counts to grow exponentially, making the ILP model much larger → slower solver. K=3 is a practical balance. |
| **Adjustable** | ✅ Yes — the `topK` parameter in `engine/combo_builder.ts`. |

### L2 — Combo Cap of 500 Does Not Guarantee Absolute Optimality

| | |
|---|---|
| **Description** | Each member is given at most 500 combos in the ILP. Combos beyond #500 are discarded (after sorting by rawDamage descending). |
| **Consequence** | In rare edge cases, a truncated combo could be the globally optimal choice for the Union as a whole. |
| **Trade-off** | A higher cap → larger ILP model → slower solving, higher timeout risk. 500 is sufficient for nearly all real-world scenarios. |
| **Adjustable** | ✅ Yes — the `MAX_COMBOS_PER_MEMBER` parameter in `engine/combo_builder.ts`. |

### L3 — 0.5% MIP Gap — Not Always Exactly Optimal

| | |
|---|---|
| **Description** | GLPK is configured to accept a solution when the **MIP gap ≤ 0.5%** relative to the theoretical optimal. |
| **Consequence** | In rare cases, the solver may terminate early with a solution up to 0.5% below the true optimal. |
| **Trade-off** | Setting mipgap = 0 (exact optimal) would significantly increase solver runtime. 0.5% is negligible in practice (a few hundred thousand out of trillions of damage). |
| **Adjustable** | ✅ Yes — the `mipgap` parameter in `engine/ilp_solver.ts`. |

### L4 — Numerical Scaling Reduces but Does Not Eliminate Rounding Errors

| | |
|---|---|
| **Description** | The engine divides all damage and HP values by `SCALE = 1,000,000` before passing them to GLPK to avoid numerical instability at coefficient magnitudes of 10¹⁰~10¹². |
| **Consequence** | The integer-to-float division may introduce small rounding errors. With GLPK's float64 precision, these errors are in the range of 10⁻⁷~10⁻⁹ — entirely acceptable. |
| **Risk** | If in-game damage ever increases by several more orders of magnitude (10¹⁵+), SCALE would need to be increased or a numerically superior solver used. |

### L5 — Feasibility Analysis (Phase 0) Is an Optimistic Estimate

| | |
|---|---|
| **Description** | Phase 0 computes max available damage per boss by summing each member's best damage, **without considering character overlap constraints**. |
| **Consequence** | `deepest` may be overestimated. Example: the Union is assessed to be able to clear L2, but after factoring in real character lock constraints, there isn't enough damage to kill all L2 bosses. |
| **Current handling** | Phase 2 (ILP) with Level Gate constraints self-corrects — if insufficient damage exists to clear L2, the solver won't open the gate. Warnings are generated in Phase 3. |
| **Remaining limitation** | Phase 0 may unnecessarily include L3 profiles in the combo builder (if L2 won't actually be cleared), making the ILP model larger than necessary. |

### L6 — `execOrder` Is Not Automatically Computed

| | |
|---|---|
| **Description** | The `execOrder1/2/3` fields in `AssignmentEntry` are designed to hold the execution wave (Wave 1: attack when Hard Mode opens; Wave 2: wait for L1 to clear first). |
| **Current status** | The engine **does not compute this automatically** — the field is set to `null` in all cases. The Admin must adjust it manually after the optimizer runs. |
| **Impact** | The UI displays no execution order. The Leader must manually infer who should attack first based on the assigned combos. |

### L7 — Finishers and Cleaners Are Not Optimized

| | |
|---|---|
| **Description** | Only members with the `regular` role are included in the ILP optimizer. `finisher` and `cleaner` members are excluded from the engine. |
| **Reason** | Finishers/cleaners are typically reserved by the Leader for special situations (finishing off low-HP bosses, mopping up missed ones). These situational assignments cannot be modeled within the general ILP. |
| **Impact** | The Leader must manually assign finishers/cleaners after the optimizer runs. The tool does not formally support this workflow. |

---

## Section 3 — Out of Scope

The following features are **not within the scope** of this tool and will not be developed unless an architectural decision is made to include them:

| # | Not Included | Reason |
|---|--------------|--------|
| S1 | **Theoretical damage calculation** (damage simulation from character builds) | Too complex, depends on many in-game variables (OL gear, cubes, skill levels...) |
| S2 | **Team composition recommendations** | Requires AI/ML or a game meta knowledge base — beyond current scope |
| S3 | **Game API integration** (live data from NIKKE servers) | The game API is not public; no official mechanism exists to read live data |
| S4 | **Normal Mode management** | Normal Mode does not involve a complex optimization problem |
| S5 | **Level 4 optimization** (infinite-HP boss) | No HP cap → no overkill → a completely different problem formulation |
| S6 | **Multi-Union / Multi-Raid simultaneously** | The current design serves a single Union on a single instance |
| S7 | **Real-time synchronization** | No WebSockets or polling — data only updates on explicit user actions |

---

## Section 4 — Operational Risks

| # | Risk | Likelihood | Impact | Current Mitigation |
|---|------|------------|--------|--------------------|
| R1 | Member submits incorrect damage (typo, wrong unit) | Medium | High — incorrect assignment | Leader manually reviews profiles before running optimize |
| R2 | Member is offline during Hard Mode | Low–Medium | Medium — missing damage | Assignment does not self-adjust; Leader handles manually |
| R3 | GLPK WASM timeout (model too large) | Low | High — no result produced | Automatic retry 3 times (30s → 60s → 120s). If still failing: reduce topK or MAX_COMBOS |
| R4 | Boss HP changes between mock battle and Hard Mode | Very Low | High — all calculations are wrong | No detection mechanism. Leader must update HP manually before optimizing |
| R5 | VPS runs out of RAM during build | Medium (on 1GB VPS) | Medium — build fails | Temporary 2GB swap creation guide included in deployment documentation |

---

## Section 5 — Summary Table

| ID | Type | Issue | Impact Level | Resolvable? |
|----|------|-------|--------------|-------------|
| A1 | Assumption | Mock damage = real damage | High | ❌ Depends on game mechanics |
| A2 | Assumption | Damage uniform across levels | Medium | ⚠️ Needs re-verification if game updates |
| A3 | Assumption | Members execute correctly | High | ❌ Outside tool's control |
| A4 | Assumption | 24h is sufficient for everyone | Low | ❌ Reasonable assumption |
| A5 | Assumption | L2/L3 profiles submitted late | Medium | ⚠️ Workflow issue |
| A6 | Assumption | Damage < MAX_SAFE_INTEGER | Low | ✅ Already validated |
| L1 | Technical Limitation | Top-K pruning misses combos | Low | ✅ Increase topK if needed |
| L2 | Technical Limitation | Combo cap of 500 | Low | ✅ Increase cap if needed |
| L3 | Technical Limitation | 0.5% MIP gap | Very Low | ✅ Reduce mipgap if needed |
| L4 | Technical Limitation | Numerical scaling rounding | Very Low | ✅ Increase SCALE if needed |
| L5 | Technical Limitation | Phase 0 optimistic estimate | Low | ⚠️ ILP partially compensates |
| L6 | Technical Limitation | execOrder not auto-computed | Medium | 🔧 **Needs implementation** |
| L7 | Technical Limitation | Finisher/cleaner manual | Low | ⚠️ By design |
| S1–S7 | Out of Scope | Features outside scope | N/A | ❌ Out of scope |
| R1–R5 | Operational Risk | Exceptional scenarios | Medium | ⚠️ Handled through process |

---

> **Legend:**
> - ✅ Resolved / easily adjustable
> - ⚠️ Partially handled / requires monitoring
> - 🔧 Known issue, needs future implementation
> - ❌ Not possible / outside the tool's control
