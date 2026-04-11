import type {
  EngineCombo,
  EngineBoss,
  AssignmentEntry,
} from "./types";

// GLPK WASM — lazy loaded singleton
// glpk.js is marked as serverExternalPackages in next.config.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let glpkPromise: Promise<any> | null = null;

function getGLPK() {
  if (!glpkPromise) {
    glpkPromise = (async () => {
      const factory = (await import("glpk.js/node")).default;
      return await factory();
    })();
  }
  return glpkPromise;
}

/**
 * ILP Solver dùng GLPK WASM (thay thế HiGHS vì HiGHS WASM crash trên model >1000 binary vars).
 *
 * Mô hình:
 *   Maximize  Σ_b e_b
 *   s.t.
 *     Σ_c y[m,c] ≤ 1              ∀m   (mỗi member chọn tối đa 1 combo)
 *     e_b ≤ Σ_{(m,c): b∈c} dmg(m,b,c) · y[m,c]  ∀b   (effective ≤ actual damage)
 *     e_b ≤ hp_b                  ∀b   (capped at HP)
 *     y[m,c] ∈ {0,1},  e_b ≥ 0
 *
 * Retry: nếu fail → reset GLPK → tăng timeout → retry.
 */
export async function ilpSolve(
  memberCombos: Map<number, EngineCombo[]>,
  bosses: EngineBoss[],
): Promise<AssignmentEntry[]> {
  const timeouts = [30, 60, 120]; // seconds

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < timeouts.length; attempt++) {
    const tmlim = timeouts[attempt];
    try {
      console.log(`[ILP] Attempt ${attempt + 1}/${timeouts.length}, timeout=${tmlim}s`);
      const result = await solveWithGLPK(memberCombos, bosses, tmlim);
      console.log(`[ILP] Solved on attempt ${attempt + 1}`);
      return result;
    } catch (err) {
      lastError = err as Error;
      console.warn(`[ILP] Attempt ${attempt + 1} failed: ${lastError.message}`);
      // Reset singleton in case WASM is corrupted
      glpkPromise = null;
      if (attempt < timeouts.length - 1) {
        console.log(`[ILP] Resetting WASM, retrying with timeout=${timeouts[attempt + 1]}s...`);
      }
    }
  }

  throw new Error(`ILP solver thất bại sau ${timeouts.length} lần thử: ${lastError?.message}`);
}

async function solveWithGLPK(
  memberCombos: Map<number, EngineCombo[]>,
  bosses: EngineBoss[],
  tmlim: number,
): Promise<AssignmentEntry[]> {
  const glpk = await getGLPK();

  // Scale factor: GLPK WASM suffers numerical instability when coefficients
  // are ~10^10–10^12. Dividing by SCALE brings them to ~10^4–10^5.
  // The optimal binary selection (y variables) is invariant to uniform scaling.
  const SCALE = 1_000_000;

  // ── Index combos globally ──────────────────────────────────────────────
  const allCombos: Array<{ memberId: number; ci: number; combo: EngineCombo }> = [];
  for (const [memberId, combos] of memberCombos) {
    combos.forEach((combo, ci) => allCombos.push({ memberId, ci, combo }));
  }

  if (allCombos.length === 0) return [];

  console.log(`[ILP] Building model: ${allCombos.length} combos, ${bosses.length} bosses, ${memberCombos.size} members`);

  // ── Build GLPK model ──────────────────────────────────────────────────
  const objective = {
    name: "total_effective",
    direction: glpk.GLP_MAX,
    vars: bosses.map((b) => ({ name: `e_${b.id}`, coef: 1.0 })),
  };

  const subjectTo: Array<{
    name: string;
    vars: Array<{ name: string; coef: number }>;
    bnds: { type: number; ub: number; lb: number };
  }> = [];

  // (1) Member assignment: Σ y[m,c] ≤ 1 ∀m
  for (const [memberId, combos] of memberCombos) {
    if (combos.length === 0) continue;
    subjectTo.push({
      name: `member_${memberId}`,
      vars: combos.map((_, ci) => ({ name: `y_${memberId}_${ci}`, coef: 1.0 })),
      bnds: { type: glpk.GLP_UP, ub: 1.0, lb: 0.0 },
    });
  }

  // (2) Damage accumulation: e_b - Σ dmg·y ≤ 0  ∀b
  // Also gather per-boss damage terms for level gate constraints
  const bossDmgTerms = new Map<number, Array<{ name: string; coef: number }>>();

  for (const boss of bosses) {
    const vars: Array<{ name: string; coef: number }> = [
      { name: `e_${boss.id}`, coef: 1.0 },
    ];
    const dmgTerms: Array<{ name: string; coef: number }> = [];
    for (const { memberId, ci, combo } of allCombos) {
      const profile = combo.profiles.find((p: { bossId: number }) => p.bossId === boss.id);
      if (profile && profile.damage > 0) {
        const sd = profile.damage / SCALE;
        vars.push({ name: `y_${memberId}_${ci}`, coef: -sd });
        dmgTerms.push({ name: `y_${memberId}_${ci}`, coef: sd });
      }
    }
    subjectTo.push({
      name: `boss_dmg_${boss.id}`,
      vars,
      bnds: { type: glpk.GLP_UP, ub: 0.0, lb: -Infinity },
    });
    bossDmgTerms.set(boss.id, dmgTerms);
  }

  // ── (3) Level Gate Constraints (C2) ────────────────────────────────────
  // Gate variable g_N ∈ {0,1}: 1 iff all Level N bosses are killed
  // 
  // For each level N ∈ {1, 2}:
  //   (a) Gate can only open if total damage ≥ total HP on level N:
  //       ∀ boss b ∈ L_N:  Σ dmg·y[m,c] ≥ HP(b) · g_N
  //       → g_N · HP(b) - Σ dmg·y ≤ 0
  //
  //   (b) Damage on level N+1 bosses is gated behind g_N:
  //       ∀ boss b ∈ L_{N+1}:  Σ dmg·y[m,c] ≤ M · g_N
  //       where M = sum of all possible damage on that boss (big enough)

  const bossesByLevel = new Map<number, EngineBoss[]>();
  for (const b of bosses) {
    if (!bossesByLevel.has(b.level)) bossesByLevel.set(b.level, []);
    bossesByLevel.get(b.level)!.push(b);
  }

  const gateBinaries: string[] = [];

  for (const gateLevel of [1, 2]) {
    const nextLevel = gateLevel + 1;
    const gateBosses = bossesByLevel.get(gateLevel) ?? [];
    const nextBosses = bossesByLevel.get(nextLevel) ?? [];

    if (gateBosses.length === 0 || nextBosses.length === 0) continue;

    const gateName = `g_${gateLevel}`;
    gateBinaries.push(gateName);

    // (a) Gate can only be 1 if every boss in level N has total damage ≥ HP
    //     For each boss b in L_N:  g_N · HP(b) - Σ dmg·y ≤ 0
    for (const boss of gateBosses) {
      const terms = bossDmgTerms.get(boss.id) ?? [];
      if (terms.length === 0) {
        // No one can attack this boss → gate can never open
        subjectTo.push({
          name: `gate_${gateLevel}_block_${boss.id}`,
          vars: [{ name: gateName, coef: 1.0 }],
          bnds: { type: glpk.GLP_UP, ub: 0.0, lb: 0.0 },
        });
      } else {
        subjectTo.push({
          name: `gate_${gateLevel}_kill_${boss.id}`,
          vars: [
            { name: gateName, coef: boss.hp / SCALE },
            ...terms.map((t) => ({ name: t.name, coef: -t.coef })),
          ],
          bnds: { type: glpk.GLP_UP, ub: 0.0, lb: -Infinity },
        });
      }
    }

    // (b) Damage on each Level N+1 boss is gated by g_N
    //     For each boss b in L_{N+1}:  Σ dmg·y ≤ M · g_N
    //     → Σ dmg·y - M · g_N ≤ 0
    for (const boss of nextBosses) {
      const terms = bossDmgTerms.get(boss.id) ?? [];
      if (terms.length === 0) continue; // no one attacks this boss anyway

      // M = upper bound on total damage for this boss (sum of all possible damage)
      const bigM = terms.reduce((sum, t) => sum + t.coef, 0);

      subjectTo.push({
        name: `gate_${gateLevel}_access_${boss.id}`,
        vars: [
          ...terms,
          { name: gateName, coef: -bigM },
        ],
        bnds: { type: glpk.GLP_UP, ub: 0.0, lb: -Infinity },
      });
    }
  }

  console.log(`[ILP] Level gate constraints: ${gateBinaries.length} gates, ${subjectTo.length} total constraints`);

  // Bounds
  const bounds: Array<{ name: string; type: number; lb: number; ub: number }> = [];
  for (const boss of bosses) {
    bounds.push({
      name: `e_${boss.id}`,
      type: glpk.GLP_DB,
      lb: 0,
      ub: boss.hp / SCALE,
    });
  }
  for (const { memberId, ci } of allCombos) {
    bounds.push({
      name: `y_${memberId}_${ci}`,
      type: glpk.GLP_DB,
      lb: 0,
      ub: 1,
    });
  }
  for (const g of gateBinaries) {
    bounds.push({
      name: g,
      type: glpk.GLP_DB,
      lb: 0,
      ub: 1,
    });
  }

  // Binary variables
  const binaries = [
    ...allCombos.map(({ memberId, ci }) => `y_${memberId}_${ci}`),
    ...gateBinaries,
  ];

  const model = {
    name: "nrc_4e6730635468346e68",
    objective,
    subjectTo,
    bounds,
    binaries,
    generals: [],
  };

  // ── Solve ──────────────────────────────────────────────────────────────
  const result = glpk.solve(model, {
    msglev: glpk.GLP_MSG_ERR,
    tmlim,
    mipgap: 0.005,
  });

  const GLP_OPT = 5;  // Optimal
  const GLP_FEAS = 2; // Feasible

  if (result.result.status !== GLP_OPT && result.result.status !== GLP_FEAS) {
    throw new Error(`GLPK status: ${result.result.status} (not optimal/feasible)`);
  }

  console.log(`[ILP] GLPK solved: status=${result.result.status === GLP_OPT ? "Optimal" : "Feasible"}, obj=${result.result.z}`);

  // ── Extract solution ──────────────────────────────────────────────────
  const entries: AssignmentEntry[] = [];

  for (const [memberId, combos] of memberCombos) {
    if (combos.length === 0) {
      entries.push({
        memberId,
        combo: null,
        warningMsg: "Không có combo hợp lệ",
      });
      continue;
    }

    let chosen: EngineCombo | null = null;
    for (let ci = 0; ci < combos.length; ci++) {
      const varName = `y_${memberId}_${ci}`;
      const val = result.result.vars[varName];
      if (val !== undefined && Math.round(val) === 1) {
        chosen = combos[ci];
        break;
      }
    }

    entries.push({ memberId, combo: chosen });
  }

  return entries;
}
