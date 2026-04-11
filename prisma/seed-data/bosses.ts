/**
 * Cấu hình 5 Boss Slot cho test raid.
 * Mỗi boss có: slot, element, displayName, HP 3 level.
 */
export const bossSlotData = [
  { slot: 1, element: "Iron",     displayName: "Porter",          hpLevel1: 99_856_279_200n,  hpLevel2: 149_784_418_800n, hpLevel3: 292_445_295_750n },
  { slot: 2, element: "Water",    displayName: "Plate",           hpLevel1: 99_856_279_200n,  hpLevel2: 149_784_418_800n, hpLevel3: 292_445_295_750n },
  { slot: 3, element: "Electric", displayName: "Land Eater",      hpLevel1: 150_841_813_600n, hpLevel2: 226_262_720_400n, hpLevel3: 349_230_901_500n },
  { slot: 4, element: "Fire",     displayName: "Rebuild Fingers", hpLevel1: 99_856_279_200n,  hpLevel2: 149_784_418_800n, hpLevel3: 292_445_295_750n },
  { slot: 5, element: "Wind",     displayName: "Material",        hpLevel1: 150_841_813_600n, hpLevel2: 226_262_720_400n, hpLevel3: 349_230_901_500n },
] as const;
