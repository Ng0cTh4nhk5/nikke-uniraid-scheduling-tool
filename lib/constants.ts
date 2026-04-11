// ── Game constants ─────────────────────────────────────────

export const ELEMENT_BADGE: Record<string, string> = {
  Fire: "badge-fire",
  Water: "badge-water",
  Wind: "badge-wind",
  Iron: "badge-iron",
  Electric: "badge-electric",
};

export const STATUS_BADGE: Record<string, string> = {
  draft: "badge-gray",
  active: "badge-green",
  closed: "badge-red",
};
export const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  active: "Đang diễn ra",
  closed: "Đã đóng",
};

export const ROLE_LABEL: Record<string, string> = {
  regular: "Thường",
  finisher: "Dứt điểm",
  cleaner: "Dọn dẹp",
};
export const ROLE_BADGE: Record<string, string> = {
  regular: "badge-green",
  finisher: "badge-blue",
  cleaner: "badge-gray",
};

export const BURST_LABEL: Record<string, string> = {
  "1": "I",
  "2": "II",
  "3": "III",
  p: "All",
};

export const ALL_ELEMENTS = ["Fire", "Water", "Wind", "Iron", "Electric"] as const;
export const ALL_CLASSES = ["Attacker", "Defender", "Supporter"] as const;
export const ALL_BURSTS = ["1", "2", "3", "p"] as const;
export const ALL_WEAPONS = ["AR", "RL", "SR", "SMG", "SG", "MG"] as const;
export const ALL_MANUFACTURERS = ["Tetra", "Elysion", "Missilis", "Pilgrim", "Abnormal"] as const;
export const VALID_ROLES = ["regular", "finisher", "cleaner"] as const;
