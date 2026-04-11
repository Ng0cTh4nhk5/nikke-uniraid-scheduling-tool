# Optimization Engine

The core optimization module of the project lives in the `engine/` directory. Its primary responsibility is to compute the optimal attack assignment schedule for a Union Raid season — maximizing total damage without violating the character lock rules.

## 1. Valid Combo Builder (`engine/combo_builder.ts`)

- Each Member has a list of Mock Battle Profiles (test team results).
- NIKKE game rule: Members can attack a maximum of 3 times per day, and **characters must not be duplicated** across the 15 total character slots used in those 3 attacks.
- The Builder function takes the full list of profiles and runs a combinatorial algorithm to generate all valid "3-Profile Combos."
- **Valid Combo**: A combination of 3 Profiles where the union of all Character IDs yields exactly 15 unique elements — meaning no character appears more than once.

## 2. ILP Solver (`engine/ilp_solver.ts`)

The personnel assignment problem under constraints is modeled as Integer Linear Programming (ILP).

- Uses the `glpk.js` library (GNU Linear Programming Kit compiled to WebAssembly) running server-side.
- Receives data from the Combo Builder and sets up the objective function: **Maximize total Effective Damage**.
- **Constraints**:
  - Each user may only participate with 1 Combo.
  - Total damage to Boss $j$ must not exceed the threshold (boss HP at level 1, 2, or 3 — excess damage is wasted).
  - Level Gate: damage cannot be dealt to Level N+1 bosses if Level N has not been cleared.
- The output is a binary variable matrix that determines: which boss each member attacks, at which HP level (`level1, level2, level3`), and the execution order.

- **Retry Mechanism:** The ILP solver retries up to 3 times with escalating timeouts (30s → 60s → 120s). Between each retry, the WASM singleton is reset to prevent WASM corruption.

> [!IMPORTANT]
> Exercise caution when modifying constraint parameters in `ilp_solver.ts`. A small mistake can render the problem Infeasible (no valid solution).

> [!NOTE]
> **Historical note:** Version 1 (v1) used HiGHS WASM as the solver and had a Greedy fallback. HiGHS crashed on models with > 1000 binary vars, so the project switched to GLPK.js from v2.0. The Greedy fallback was also removed since ILP is fast enough at practical scales (solving in 1–10 seconds).
