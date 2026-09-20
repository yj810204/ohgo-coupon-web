import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export const ADMIN_GATE_COOKIE = 'ohgo_admin_gate';
const GATE_MAX_AGE_SEC = 60 * 60 * 12;

function getConfiguredPassword() {
  return process.env.ADMIN_GATE_PASSWORD?.trim() ?? '';
}

/** `.env` 의 ADMIN_GATE=1 이면 켜짐, 0이면 꺼짐 */
export function isAdminGateEnabled() {
  return process.env.ADMIN_GATE?.trim() === '1';
}

export function isAdminGateConfigured() {
  return isAdminGateEnabled() && getConfiguredPassword().length > 0;
}

function gateToken(password: string) {
  const secret = process.env.ADMIN_GATE_SECRET?.trim() || password;
  return createHmac('sha256', secret).update(`ohgo-admin-gate:${password}`).digest('hex');
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function adminGateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GATE_MAX_AGE_SEC,
  };
}

export function verifyAdminGatePassword(password: string) {
  const expected = getConfiguredPassword();
  if (!expected) return 'unset' as const;
  if (!safeEqual(password, expected)) return 'invalid' as const;
  return 'ok' as const;
}

export function adminGateCookieValue() {
  return gateToken(getConfiguredPassword());
}

export async function isAdminGateUnlocked() {
  if (!isAdminGateEnabled()) return true;
  const password = getConfiguredPassword();
  if (!password) return false;
  const token = (await cookies()).get(ADMIN_GATE_COOKIE)?.value;
  if (!token) return false;
  return safeEqual(token, gateToken(password));
}
