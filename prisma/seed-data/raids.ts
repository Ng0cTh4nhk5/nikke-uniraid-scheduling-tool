/**
 * Cấu hình các mùa raid khởi tạo ban đầu.
 */
export const testRaidConfig = {
  name: "[TEST] UniRaid Tháng 3/2026",
  hardModeDate: new Date("2026-03-10T00:00:00Z"),
  status: "closed",
  notes: "Dữ liệu test mẫu. Dùng để kiểm tra optimizer.",
} as const;

export const newRaidConfig = {
  name: "UniRaid Tháng 4/2026",
  status: "draft",
  notes: "Mùa raid mới. Admin cấu hình boss xong rồi chuyển sang active.",
} as const;
