// ────────────────────────────────────────────────
//  Shared API response types (L-2 fix: DRY)
// ────────────────────────────────────────────────

export interface ApiBossSlot {
  id: number;
  raidId: number;
  slot: number;
  element: string;
  displayName: string | null;
  hpLevel1: string; // BigInt serialized as string
  hpLevel2: string;
  hpLevel3: string;
  notes: string | null;
}

export interface ApiRaid {
  id: number;
  name: string;
  hardModeDate: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  bossSlots?: ApiBossSlot[];
  _count?: { bossSlots: number };
}

export interface ApiMember {
  id: number;
  name: string;
  role: string;
  synchroDeviceLevel: number;
  isActive: boolean;
  notes: string | null;
}

export interface ApiCharacter {
  id: number;
  name: string;
  class: string;
  burst: string;
  weapon: string;
  element: string;
  manufacturer: string;
  image: string | null;
}

export interface ApiProfile {
  id: number;
  memberId: number;
  bossSlotId: number;
  char1Id: number;
  char2Id: number;
  char3Id: number;
  char4Id: number;
  char5Id: number;
  damage: string; // BigInt serialized
  submittedAt: string;
  notes: string | null;
  member?: ApiMember;
  bossSlot?: ApiBossSlot;
  char1?: ApiCharacter;
  char2?: ApiCharacter;
  char3?: ApiCharacter;
  char4?: ApiCharacter;
  char5?: ApiCharacter;
}

export interface ApiAssignment {
  id: number;
  raidId: number;
  generatedAt: string;
  scenario: number;
  paramsJson: string;
  status: string;
  notes: string | null;
}
