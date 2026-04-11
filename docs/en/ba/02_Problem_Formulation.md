# Problem Formulation Document

---

## 1. Problem Statement

> Given the damage data for each member (collected via mock battles), produce an attack assignment schedule for the entire Union such that the **total effective damage dealt in Hard Mode is maximized**.

---

## 2. Definitions & Notation

### 2.1 Entities

| Symbol       | Name              | Description |
|--------------|-------------------|-------------|
| $M$          | Set of members    | $M = \{m_1, m_2, \ldots, m_{32}\}$, up to 32 members |
| $B$          | Set of bosses     | 16 bosses: Level 1–3 (5 bosses/level, finite HP) + Level 4 (1 boss, infinite HP) |
| $B_{fin}$    | Bosses in scope   | Scope limited to: **only the 15 bosses at Levels 1, 2, 3** |
| $HP(b)$      | HP of boss $b$    | Fixed, given for each boss $b \in B_{fin}$ |
| $T(m)$       | Attacks of $m$    | Each member has at most 3 attacks: $T(m) = \{t_1, t_2, t_3\}$ |
| $elem(b)$    | Boss element      | Each boss belongs to one of 5 different elements within the same level |
| $P$          | Set of profiles   | Each profile is one specific mock battle result (see Section 2.2) |
| $P(m)$       | Profiles of member $m$ | The set of profiles that member $m$ has submitted |
| $C(m)$       | Valid combos of $m$ | The set of all valid combos that can be formed from $P(m)$ (see Section 2.2) |

### 2.2 Profile and Combo Model

#### Profile
Each time a member performs a mock battle, they submit a **profile** consisting of:

$$p = (m,\ b,\ \text{chars}_p,\ dmg_p)$$

**Interpretation:** Each profile is a "mock battle result record" describing: **who** attacked ($m$), **which boss** was attacked ($b$), **which team** was used (5 characters $\text{chars}_p$), and **how much damage** was dealt ($dmg_p$).

| Field | Description |
|-------|-------------|
| $m$ | The member who performed the attack |
| $b$ | The boss that was attacked |
| $\text{chars}_p \subset \text{Characters}$ | The characters used (exactly 5) |
| $dmg_p$ | Total damage dealt during that mock battle |

Each member may submit **multiple profiles for the same boss** (with different team compositions).

#### Combo
A **combo** for member $m$ is a set of 3 profiles $\{p_1, p_2, p_3\} \subset P(m)$ satisfying:

1. **3 distinct bosses:** $b_{p_1} \neq b_{p_2}$, $b_{p_1} \neq b_{p_3}$, $b_{p_2} \neq b_{p_3}$
2. **No character overlap:** $\text{chars}_{p_i} \cap \text{chars}_{p_j} = \emptyset \quad \forall i \neq j$

**Interpretation:** A combo is a set of 3 mock battle results where (1) each attack targets a different boss (not necessarily the same level), and (2) no character is reused across the 3 attacks.

**The 3 bosses in a combo are not required to be in the same level.** A typical combo will span multiple levels (e.g., `L1-Boss2, L2-Boss4, L3-Boss1`), consistent with the game's level gate mechanic.

Full set of valid combos for member $m$: $C(m) = \{c \mid c \text{ is a valid combo from } P(m)\}$

> **Execution Order:** For cross-level combos, the execution order must follow the level gate: a profile targeting Level $N$ can only be used after all of Level $N-1$ has been killed. The tool outputs this order in the assignment schedule.

### 2.3 Decision Variables

- $y_{m,c} \in \{0, 1\}$ — equals $1$ if member $m$ is assigned to execute combo $c \in C(m)$.

**Interpretation:** This is the "answer" the tool needs to find — for each member, select exactly **1 combo** from among all their valid combos.

### 2.4 Effective Damage

The damage actually counted toward the ranking for profile $p$ when it is selected:

$$\text{eff}(p) = \min\bigl(dmg_p,\ \text{remainingHP}(b_p)\bigr)$$

**Interpretation:** Only the portion of damage that **actually harms the boss** is counted — the smaller value between "the team's damage output" and "the boss's remaining HP." Example: boss has 100K HP remaining, team deals 300K damage → only 100K is counted, 200K is wasted.

> All bosses within scope have finite HP — there is no infinite-damage scenario.

> **Consequence:** Each finite-HP boss only "absorbs" exactly `HP(b)` damage. Any damage beyond that is **wasted (overkill)**.

### 2.5 Boss Element System

**Characteristics:**
- The 5 bosses within the same level belong to **5 different elements**.
- The optimal team for each element uses a distinct set of characters. **However**, teams for different elements **may share** some important support/buffer characters (usable across multiple elements).

**Consequence:** This means the character lock constraint can occur even between 2 attacks targeting bosses of different elements. The Profile+Combo design in Section 2.2 handles this precisely by validating directly against the character list.

---

## 3. Constraints

### C1 — Each member selects at most 1 combo

$$\forall m \in M: \quad \sum_{c \in C(m)} y_{m,c} \leq 1$$

**Interpretation:** Each member **selects at most 1 combo** (= 3 attacks across 3 bosses). The solver may decide not to assign a combo to a member if all accessible bosses already have sufficient damage — in that case the member will have combo = null.

> **Note:** The constraint is $\leq 1$ rather than $= 1$. This allows the solver more flexibility: if forced to $= 1$, the solver must assign a combo even if it causes wasteful overkill.

### C2 — Level Gate Constraint

No member may attack a boss at Level $N+1$ until **all Level N bosses have been killed**.

Modeled using **binary gate variables** $g_N \in \{0,1\}$ for $N \in \{1, 2\}$:

**(C2a) Gate only opens when all Level N bosses are killed:**
$$\forall b \in L_N: \quad g_N \cdot HP(b) \leq \sum_{m,c:\text{profile targets }b} y_{m,c} \cdot dmg_{p_b(c)}$$

**(C2b) Damage to Level N+1 is gated:**
$$\forall b \in L_{N+1}: \quad \sum_{m,c:\text{profile targets }b} y_{m,c} \cdot dmg_{p_b(c)} \leq M \cdot g_N$$

Where $M$ = big-M (total maximum damage available for boss $b$).

**Interpretation:** Gate $g_N = 1$ when all Level N bosses have been killed (total damage ≥ HP). When gate = 0, no one may deal damage to any Level N+1 boss. When gate = 1, constraint C2b is released (since M is large enough).

> **Comparison with pre-filtering:** In addition to the level gate constraint in the ILP, the engine also **pre-filters** profiles in Phase 0 (removing profiles targeting levels > maxAccessibleLevel). The two mechanisms complement each other: pre-filtering reduces the ILP model size, while the level gate constraint ensures correctness within the solver.

### C3 — Overkill Not Counted (Damage Cap)

$$\text{TotalEffective}(b) = \min\!\left(\sum_{m,c} y_{m,c} \cdot dmg_{p_b(c)},\ HP(b)\right)$$

**Interpretation:** The total counted damage for boss $b$ = the **minimum** of "total damage everyone dealt to that boss" and "the boss's HP." If a boss has 500K HP but the entire Union deals 800K damage → only 500K is recorded, 300K excess is lost (overkill). Here $p_b(c)$ is the profile targeting boss $b$ within combo $c$.

### C4 — Valid Combo: No Character Overlap, 3 Distinct Bosses

This condition is embedded **automatically** when constructing $C(m)$ (see Section 2.2). All combos in $C(m)$ already satisfy:

$$\text{chars}_{p_i} \cap \text{chars}_{p_j} = \emptyset \quad \forall p_i, p_j \in c,\ i \neq j$$

**Interpretation:** Within 1 combo, any 2 attacks must **share no characters**. Example: if attack 1 uses "Alice", then attacks 2 and 3 must not include "Alice" on their team.

> Character overlap across different elements is **completely resolved** by this constraint — it is no longer a limitation.

---

## 4. Objective Function

**Scope:** Only optimizes across the **15 finite-HP bosses** of Levels 1, 2, 3. Level 4 is out of scope.

**Maximize total effective damage:**

$$\max \sum_{b \in B_{fin}} \min\!\left(HP(b),\ \sum_{m,c} y_{m,c} \cdot dmg_{p_b(c)}\right)$$

**Interpretation:** Find an assignment such that **the total damage counted across all 15 bosses is maximized**. For each boss, counted damage does not exceed HP (overkill is discarded). Summing all together → this is the number the tool tries to maximize.

This objective function is **correct for all scenarios** because:
- Alive boss: contributes exactly the HP it loses (no overkill).
- Inaccessible boss (due to level gate): contributes 0 — combos targeting it are blocked by C2.

### 4.1 Practical Priority Tiers

The objective function above is the general formulation. In practice, depending on the Union's total available damage, it reduces to 3 objectives prioritized in order:

| Priority | Objective | Example |
|----------|-----------|---------|
| **1 (highest)** | **Kill enough** bosses — kill an entire level to unlock the next | Kill all L1 bosses to unlock L2 > deal extra damage to already-dead L1 bosses |
| **2** | **Maximize effective damage** on the remaining bosses of the deepest accessible level | Dump damage on L3 bosses even if they can't all be killed |
| **3 (secondary)** | **Minimize overkill** on already-killed bosses to conserve attacks | Boss at 100K HP → assign someone dealing ~100K, not someone dealing 500K |

> **Implication for the algorithm:** Before running the ILP solver, the engine must determine the scenario (Phase 0: how many levels can the Union clear) to pre-filter profiles and set up level gate constraints. (See `03_Solution_Design.md`.)

---

## 5. Complexity Note

Theoretically, this is a combinatorial problem of the **NP-hard** class (similar to bin-packing + assignment with ordering constraints). However, at practical scale:
- Up to **32 members × ~500 combos/member = ~16,000 binary variables**
- **15 EngineBosses** (5 slots × 3 levels) + 2 gate variables
- ~50 constraints

→ Small scale — **ILP solver (GLPK.js WASM)** solves exactly (exact optimal) in **1–10 seconds**. No greedy fallback needed.

> **Historical note:** Version 1 (v1) proposed Greedy as the primary solver. After evaluation, ILP was selected as the **sole method** because the scale is small enough for the solver to run quickly, and results are guaranteed optimal.

---

## 6. Assumptions & Limitations

| # | Assumption / Limitation | Justification |
|---|--------------------------|---------------|
| A1 | Each profile $p$ has a fixed $dmg_p$ — the actual result of one specific mock battle | Real measured data, not an estimate |
| A2 | All members are online and execute the assignment schedule correctly | The tool cannot control user behavior |
| A3 | Level 2 and 3 profiles are submitted after those levels are unlocked in Hard Mode | Mock battles allow testing the current level |
| A4 | The execution order within the day is not considered (who goes first/last) | 24h is long enough for everyone to complete their attacks |
| A5 | Damage < MAX_SAFE_INTEGER (≈ 9×10^15) | Engine converts BigInt→Number for the solver. Validated before conversion. |
