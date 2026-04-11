import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ────────────────────────────────────────────────
//  Server-side auth helpers (C-1, C-2, C-3 fixes)
// ────────────────────────────────────────────────

const ADMIN_COOKIE = "nikke_admin_token";
const MEMBER_COOKIE = "nikke_member_id";
const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Get admin password from env. Throws if not configured (C-2 fix).
 */
export function getAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD?.trim();
  if (!pw || pw.length === 0) {
    throw new Error("ADMIN_PASSWORD env var is not configured");
  }
  return pw;
}

/**
 * Sign a value with HMAC-SHA256 using ADMIN_PASSWORD as secret.
 * Returns "value.signature" format.
 */
function sign(value: string): string {
  const secret = getAdminPassword();
  const sig = crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex")
    .substring(0, 16); // 16 hex chars = 64 bits — sufficient for cookie signing
  return `${value}.${sig}`;
}

/**
 * Verify a signed value. Returns the original value or null if invalid.
 */
function verify(signedValue: string): string | null {
  const lastDot = signedValue.lastIndexOf(".");
  if (lastDot === -1) return null;
  const value = signedValue.substring(0, lastDot);
  const expected = sign(value);
  if (signedValue !== expected) return null;
  return value;
}

// ────── Admin ──────

/**
 * Check if request has valid admin token (C-1 fix: server-side verification).
 */
export function isAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const value = verify(token);
  return value === "admin";
}

/**
 * Set admin cookie on response (httpOnly, signed).
 */
export function setAdminCookie(res: NextResponse): void {
  const token = sign("admin");
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

/**
 * Clear admin cookie on response.
 */
export function clearAdminCookie(res: NextResponse): void {
  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ────── Member Identity ──────

/**
 * Get the current member ID from signed cookie (C-3 fix).
 */
export function getMemberId(req: NextRequest): number | null {
  const token = req.cookies.get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  const value = verify(token);
  if (!value) return null;
  const id = parseInt(value);
  return isNaN(id) ? null : id;
}

/**
 * Set member identity cookie on response (httpOnly, signed, secure in prod).
 */
export function setMemberCookie(res: NextResponse, memberId: number): void {
  const token = sign(String(memberId));
  res.cookies.set(MEMBER_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

/**
 * Clear member identity cookie.
 */
export function clearMemberCookie(res: NextResponse): void {
  res.cookies.set(MEMBER_COOKIE, "", {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ────── Guard helpers for API routes (H-5 fix) ──────

/**
 * Returns a 403 response if the request is not from an admin.
 * Usage: const denied = requireAdmin(req); if (denied) return denied;
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Không có quyền admin" }, { status: 403 });
  }
  return null;
}
