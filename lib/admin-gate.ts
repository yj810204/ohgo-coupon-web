import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export const ADMIN_GATE_COOKIE = 'ohgo_admin_gate';
const GATE_MAX_AGE_SEC = 60 * 60 * 12;
const SETTINGS_KEY = 'main';
const MIN_PASSWORD_LENGTH = 4;

function envPassword() {
  return process.env.ADMIN_GATE_PASSWORD?.trim() ?? '';
}

function gatePepper() {
  return process.env.ADMIN_GATE_SECRET?.trim() || 'ohgo-admin-gate-v1';
}

export function isAdminGateEnabledByEnv() {
  return process.env.ADMIN_GATE?.trim() === '1';
}

export function hashAdminGatePassword(password: string) {
  return createHmac('sha256', gatePepper()).update(`ohgo-admin-gate-pw:${password}`).digest('hex');
}

function gateToken(material: string) {
  const secret = process.env.ADMIN_GATE_SECRET?.trim() || material;
  return createHmac('sha256', secret).update(`ohgo-admin-gate:${material}`).digest('hex');
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type SiteSettingsRow = {
  raw: Record<string, unknown>;
  enabled: boolean | null;
  passwordHash: string;
};

async function readSiteSettingsRow(): Promise<SiteSettingsRow | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();
    if (error || !data?.value || typeof data.value !== 'object') return null;
    const raw = data.value as Record<string, unknown>;
    const enabled = raw.adminGateEnabled;
    const hash = typeof raw.adminGatePasswordHash === 'string' ? raw.adminGatePasswordHash.trim() : '';
    return {
      raw,
      enabled: enabled === true ? true : enabled === false ? false : null,
      passwordHash: hash,
    };
  } catch {
    return null;
  }
}

async function cookieMaterial(row?: SiteSettingsRow | null) {
  const current = row === undefined ? await readSiteSettingsRow() : row;
  if (current?.passwordHash) return current.passwordHash;
  return envPassword();
}

/** 사이트 설정 > 관리자 확인. 저장 전이면 .env ADMIN_GATE */
export async function isAdminGateEnabled() {
  const row = await readSiteSettingsRow();
  if (row?.enabled !== null && row?.enabled !== undefined) return row.enabled;
  return isAdminGateEnabledByEnv();
}

export async function isAdminGatePasswordConfigured() {
  const row = await readSiteSettingsRow();
  return Boolean(row?.passwordHash) || envPassword().length > 0;
}

export async function isAdminGateConfigured() {
  return (await isAdminGateEnabled()) && (await isAdminGatePasswordConfigured());
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

export async function verifyAdminGatePassword(password: string) {
  const row = await readSiteSettingsRow();
  if (row?.passwordHash) {
    return safeEqual(hashAdminGatePassword(password), row.passwordHash) ? 'ok' as const : 'invalid' as const;
  }
  const expected = envPassword();
  if (!expected) return 'unset' as const;
  return safeEqual(password, expected) ? 'ok' as const : 'invalid' as const;
}

export async function adminGateCookieValue() {
  const material = await cookieMaterial();
  if (!material) return '';
  return gateToken(material);
}

export async function isAdminGateUnlocked() {
  if (!(await isAdminGateEnabled())) return true;
  const material = await cookieMaterial();
  if (!material) return false;
  const token = (await cookies()).get(ADMIN_GATE_COOKIE)?.value;
  if (!token) return false;
  return safeEqual(token, gateToken(material));
}

export async function saveAdminGateSettings(input: {
  enabled: boolean;
  password?: string;
}) {
  const password = input.password?.trim() ?? '';
  const row = await readSiteSettingsRow();
  const hasPassword = Boolean(row?.passwordHash) || envPassword().length > 0;

  if (input.enabled && !password && !hasPassword) {
    return { ok: false as const, error: '관리자 확인을 켜려면 비밀번호를 입력해 주세요.' };
  }
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` };
  }

  const raw = { ...(row?.raw ?? {}) };
  raw.adminGateEnabled = input.enabled;
  if (password) {
    raw.adminGatePasswordHash = hashAdminGatePassword(password);
    delete raw.adminGatePassword;
  }
  raw.updatedAt = new Date().toISOString();

  const supabase = createAdminClient();
  const { error } = await supabase.from('site_settings').upsert({
    key: SETTINGS_KEY,
    value: raw,
  });
  if (error) throw error;

  return { ok: true as const, passwordUpdated: Boolean(password) };
}
