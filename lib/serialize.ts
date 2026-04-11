// ────────────────────────────────────────────────
//  BigInt serialization helpers (L-1 fix: DRY)
// ────────────────────────────────────────────────

/**
 * Serialize a BossSlot record for JSON response.
 * Converts BigInt HP fields to strings.
 */
export function serializeBossSlot<T extends { hpLevel1: bigint; hpLevel2: bigint; hpLevel3: bigint }>(
  bs: T
): Omit<T, "hpLevel1" | "hpLevel2" | "hpLevel3"> & { hpLevel1: string; hpLevel2: string; hpLevel3: string } {
  const { hpLevel1, hpLevel2, hpLevel3, ...rest } = bs;
  return {
    ...rest,
    hpLevel1: hpLevel1.toString(),
    hpLevel2: hpLevel2.toString(),
    hpLevel3: hpLevel3.toString(),
  };
}

/**
 * Serialize a Profile record for JSON response.
 * Converts BigInt damage to string.
 */
export function serializeProfile<T extends { damage: bigint }>(
  p: T
): Omit<T, "damage"> & { damage: string } {
  const { damage, ...rest } = p;
  return { ...rest, damage: damage.toString() };
}
