/**
 * Format damage value for display (rút gọn: 18.50B, 35.2M).
 * Dùng ở profile list, boss config — nơi ít quan trọng.
 */
export function fmtDamage(n: number | bigint | string): string {
  const num = toNumber(n);
  if (num >= 1_000_000_000) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1_000_000) return (num / 1e6).toFixed(1) + "M";
  return num.toLocaleString("vi-VN");
}

/**
 * Format damage đầy đủ với dấu phẩy: 18,500,000,000.
 * Dùng ở trang kết quả phân công — nơi quan trọng.
 */
export function fmtDamageFull(n: number | bigint | string): string {
  const num = toNumber(n);
  return num.toLocaleString("vi-VN");
}

function toNumber(n: number | bigint | string): number {
  if (typeof n === "string") return Number(BigInt(n));
  if (typeof n === "bigint") return Number(n);
  return n;
}
