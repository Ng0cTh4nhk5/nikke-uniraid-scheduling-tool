import type { EngineProfile, EngineCombo } from "./types";

/**
 * Pha 1: Xây dựng tất cả combo hợp lệ cho mỗi member.
 *
 * Combo hợp lệ = 3 profiles nhắm 3 boss khác nhau,
 * sao cho tổng 15 charId (5+5+5) đều phân biệt nhau.
 *
 * Để giảm tổ hợp, với mỗi boss ta chỉ giữ top-K profiles
 * (theo damage giảm dần). Mặc định K=3.
 * Kết quả được cap tối đa MAX_COMBOS_PER_MEMBER (500) combo/member.
 */
const MAX_COMBOS_PER_MEMBER = 500;
export function buildCombos(
  profiles: EngineProfile[],
  topK = 3
): Map<number, EngineCombo[]> {
  // Group profiles: memberId → bossId → top-K profiles
  const byMember = new Map<number, Map<number, EngineProfile[]>>();

  for (const p of profiles) {
    if (!byMember.has(p.memberId)) byMember.set(p.memberId, new Map());
    const byBoss = byMember.get(p.memberId)!;
    if (!byBoss.has(p.bossId)) byBoss.set(p.bossId, []);
    byBoss.get(p.bossId)!.push(p);
  }

  const result = new Map<number, EngineCombo[]>();

  for (const [memberId, byBoss] of byMember) {
    // Keep top-K per boss
    const bossEntries: Array<{ bossId: number; profiles: EngineProfile[] }> = [];
    for (const [bossId, ps] of byBoss) {
      const topProfiles = ps
        .slice()
        .sort((a, b) => b.damage - a.damage)
        .slice(0, topK);
      bossEntries.push({ bossId, profiles: topProfiles });
    }

    const combos: EngineCombo[] = [];
    const n = bossEntries.length;

    // Need at least 3 distinct bosses
    if (n < 3) {
      result.set(memberId, []);
      continue;
    }

    // Enumerate all C(n,3) triples of bosses
    for (let i = 0; i < n - 2; i++) {
      for (let j = i + 1; j < n - 1; j++) {
        for (let k = j + 1; k < n; k++) {
          const groupA = bossEntries[i].profiles;
          const groupB = bossEntries[j].profiles;
          const groupC = bossEntries[k].profiles;

          // Try every combination of 1 profile from each boss group
          for (const pa of groupA) {
            for (const pb of groupB) {
              for (const pc of groupC) {
                if (charsAreUnique(pa, pb, pc)) {
                  combos.push({
                    memberId,
                    profiles: [pa, pb, pc],
                    rawDamage: pa.damage + pb.damage + pc.damage,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Cap combos to avoid overwhelming ILP solver
    if (combos.length > MAX_COMBOS_PER_MEMBER) {
      const originalCount = combos.length;
      combos.sort((a, b) => b.rawDamage - a.rawDamage);
      combos.length = MAX_COMBOS_PER_MEMBER;
      console.warn(`[combo_builder] Member ${memberId}: capped from ${originalCount} to ${MAX_COMBOS_PER_MEMBER} combos`);
    }

    result.set(memberId, combos);
  }

  return result;
}

/**
 * Kiểm tra 3 profiles có tổng 15 nhân vật không ai bị lặp lại.
 */
function charsAreUnique(
  p1: EngineProfile,
  p2: EngineProfile,
  p3: EngineProfile
): boolean {
  const seen = new Set<number>();
  for (const profile of [p1, p2, p3]) {
    for (const id of profile.charIds) {
      if (seen.has(id)) return false;
      seen.add(id);
    }
  }
  return true;
}
