// Engine shared types
// All BigInt damage/hp converted to number for solver (safe up to ~9×10^15)

export interface EngineProfile {
  id: number;
  memberId: number;
  bossId: number;
  charIds: number[];     // exactly 5
  damage: number;        // converted from BigInt
}

export interface EngineBoss {
  id: number;
  level: number;
  slot: number;
  element: string;
  hp: number;            // converted from BigInt
  displayName: string | null;
}

export interface EngineMember {
  id: number;
  name: string;
  role: string;
}

/** A valid combo for one member: exactly 3 profiles, no char overlap */
export interface EngineCombo {
  memberId: number;
  profiles: [EngineProfile, EngineProfile, EngineProfile];
  /** Raw sum damage across 3 bosses (before HP cap) */
  rawDamage: number;
}

/** Per-member assignment result */
export interface AssignmentEntry {
  memberId: number;
  combo: EngineCombo | null;
  /** Reason if no combo was assigned */
  warningMsg?: string;
}

/** Full optimization result */
export interface OptimizationResult {
  /** Assigned combos per member */
  entries: AssignmentEntry[];
  /** Total effective damage (sum of min(allocated, hp) per boss) */
  totalEffectiveDamage: number;
  /** Per-boss breakdown */
  bossDamage: Array<{
    bossId: number;
    allocatedDamage: number;
    effectiveDamage: number;
    hp: number;
    overkill: number;
  }>;
  /** Members with no valid combos */
  warnings: string[];
  /** Time taken in ms */
  elapsedMs: number;
  /** Pha 0: deepest level Union can fully clear (0–3) */
  deepest: number;
  /** Max accessible level (deepest + 1, capped at 3) */
  maxAccessibleLevel: number;
}
