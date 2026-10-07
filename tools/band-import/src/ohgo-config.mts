export const DEFAULT_OHGO_BASE_URL = 'https://ohgo.codejaka.com';

export type OhgoConfig = {
  /** 오고피씽 웹 주소. 이름+생년월일 로그인 API와 앱 링크에 쓴다 */
  baseUrl: string;
  supabaseUrl: string;
  /** 웹 번들에 공개된 anon 키. RLS를 그대로 통과해야 하므로 service_role 키는 받지 않는다 */
  anonKey: string;
  projectRef: string;
  source: 'env' | 'discovered';
};

export type Fetch = typeof fetch;

export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json === 'object' && json !== null ? json : null;
  } catch {
    return null;
  }
}

export function projectRefFromUrl(supabaseUrl: string): string {
  const host = new URL(supabaseUrl).hostname;
  const m = /^([a-z0-9]+)\.supabase\.(co|in)$/.exec(host);
  return m ? m[1] : host;
}

function normalizeBaseUrl(raw: string): string {
  const url = new URL(raw);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !local) throw new Error(`오고피씽 주소는 https여야 합니다: ${raw}`);
  return url.origin;
}

export function assertAnonKey(key: string, supabaseUrl?: string): void {
  const payload = decodeJwtPayload(key);
  if (payload?.role === 'service_role') {
    throw new Error('service_role 키는 쓰지 않습니다. 공개 anon 키(NEXT_PUBLIC_SUPABASE_ANON_KEY)를 넣으세요.');
  }
  if (payload && payload.role !== 'anon') throw new Error('anon 키가 아닙니다.');
  if (payload && supabaseUrl && typeof payload.ref === 'string' && payload.ref !== projectRefFromUrl(supabaseUrl)) {
    throw new Error('anon 키와 Supabase 주소의 프로젝트가 다릅니다.');
  }
}

/** 웹 번들 텍스트에서 Supabase 주소와 anon 키를 찾는다 */
export function findSupabaseConfigInText(text: string): { supabaseUrl: string; anonKey: string } | null {
  const refs = new Set([...text.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)].map((m) => m[1]));
  for (const m of text.matchAll(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g)) {
    const payload = decodeJwtPayload(m[0]);
    if (payload?.role !== 'anon' || typeof payload.ref !== 'string') continue;
    if (refs.size === 0 || refs.has(payload.ref)) {
      return { supabaseUrl: `https://${payload.ref}.supabase.co`, anonKey: m[0] };
    }
  }
  return null;
}

/** 오고피씽 웹 첫 화면이 읽는 JS 번들에서 공개 Supabase 설정을 찾는다 */
export async function discoverSupabaseConfig(baseUrl: string, fetchImpl: Fetch = fetch): Promise<{ supabaseUrl: string; anonKey: string }> {
  const fail = (why: string) =>
    new Error(`${baseUrl}에서 Supabase 설정을 찾지 못했습니다 (${why}). OHGO_SUPABASE_URL, OHGO_SUPABASE_ANON_KEY를 직접 지정하세요.`);
  let html: string;
  try {
    const res = await fetchImpl(`${baseUrl}/`, { redirect: 'follow' });
    if (!res.ok) throw fail(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    if (err instanceof Error && err.message.includes('Supabase 설정')) throw err;
    throw fail((err as Error).message);
  }
  const inline = findSupabaseConfigInText(html);
  if (inline) return inline;
  const scripts = [...new Set([...html.matchAll(/src="([^"]*\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]))].slice(0, 60);
  for (const src of scripts) {
    const url = new URL(src, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) continue;
    const res = await fetchImpl(url).catch(() => null);
    if (!res?.ok) continue;
    const found = findSupabaseConfigInText(await res.text());
    if (found) return found;
  }
  throw fail('번들에서 찾지 못함');
}

export async function resolveOhgoConfig(env: Record<string, string | undefined>, fetchImpl: Fetch = fetch): Promise<OhgoConfig> {
  const baseUrl = normalizeBaseUrl(env.OHGO_BASE_URL || DEFAULT_OHGO_BASE_URL);
  if (env.OHGO_SUPABASE_URL || env.OHGO_SUPABASE_ANON_KEY) {
    if (!env.OHGO_SUPABASE_URL || !env.OHGO_SUPABASE_ANON_KEY) {
      throw new Error('OHGO_SUPABASE_URL과 OHGO_SUPABASE_ANON_KEY는 함께 지정해야 합니다.');
    }
    const supabaseUrl = normalizeBaseUrl(env.OHGO_SUPABASE_URL);
    assertAnonKey(env.OHGO_SUPABASE_ANON_KEY, supabaseUrl);
    return { baseUrl, supabaseUrl, anonKey: env.OHGO_SUPABASE_ANON_KEY, projectRef: projectRefFromUrl(supabaseUrl), source: 'env' };
  }
  const found = await discoverSupabaseConfig(baseUrl, fetchImpl);
  assertAnonKey(found.anonKey, found.supabaseUrl);
  return { baseUrl, ...found, projectRef: projectRefFromUrl(found.supabaseUrl), source: 'discovered' };
}
