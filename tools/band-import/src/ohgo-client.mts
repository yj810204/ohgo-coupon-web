import type { Fetch, OhgoConfig } from './ohgo-config.mts';

export const PHOTO_BUCKET = 'photos';

type Row = Record<string, unknown>;

/** 앱의 /api/community/upload-photo와 같은 경로 규칙: community/photos/photo_{ms}_{7자}.{확장자} */
export function newPhotoObjectPath(ext: string, now = Date.now(), random = Math.random()): string {
  return `community/photos/photo_${now}_${random.toString(36).substring(2, 9)}.${ext}`;
}

export function publicPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export class OhgoRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function errorFrom(res: Response, what: string): Promise<OhgoRequestError> {
  const text = await res.text();
  let detail = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    detail = j.message || j.error || j.msg || detail;
  } catch {
    // 본문이 JSON이 아니면 앞부분만 보여 준다
  }
  return new OhgoRequestError(`${what} 실패: ${detail || `HTTP ${res.status}`} (HTTP ${res.status})${errorHint(res.status, detail)}`, res.status);
}

/** 서버가 영어로 답하는 흔한 거절 이유를 우리말로 덧붙인다 */
export function errorHint(status: number, detail: string): string {
  if (/row-level security|violates.*policy|unauthorized/i.test(detail)) {
    return '. 서버가 이 계정의 저장을 막았습니다 (Supabase 권한 설정 확인 필요)';
  }
  if (status === 413 || /maximum allowed size|too large|payload/i.test(detail)) return '. 사진이 서버가 받는 크기보다 큽니다';
  if (/mime|content type|invalid_mime/i.test(detail)) return '. 서버가 이 사진 형식을 받지 않습니다';
  if (/jwt|token|expired/i.test(detail) || status === 401) return '. 로그인이 만료되었을 수 있습니다. 로그아웃 후 다시 로그인하세요';
  if (status === 403) return '. 관리자 권한을 확인하세요';
  if (status >= 500) return '. 서버 오류입니다. 잠시 뒤 다시 해 보세요';
  return '';
}

/** Supabase REST/Storage를 관리자 토큰으로 직접 부른다. RLS(is_admin)를 그대로 통과해야 한다 */
export class OhgoClient {
  private cfg: OhgoConfig;
  private accessToken: string | null;
  private fetchImpl: Fetch;

  constructor(cfg: OhgoConfig, accessToken: string | null, fetchImpl: Fetch = fetch) {
    this.cfg = cfg;
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.cfg.anonKey,
      authorization: `Bearer ${this.accessToken ?? this.cfg.anonKey}`,
      ...extra,
    };
  }

  async select(table: string, query: string): Promise<Row[]> {
    const res = await this.fetchImpl(`${this.cfg.supabaseUrl}/rest/v1/${table}?${query}`, {
      headers: this.headers({ accept: 'application/json' }),
    });
    if (!res.ok) throw await errorFrom(res, `${table} 조회`);
    return (await res.json()) as Row[];
  }

  /** 테이블에 아직 없는 선택 칸은 빼고 다시 시도한다(앱의 uploadPhoto와 같은 방식) */
  async insert(table: string, row: Row, optionalColumns: string[] = []): Promise<string> {
    const body = { ...row };
    for (;;) {
      const res = await this.fetchImpl(`${this.cfg.supabaseUrl}/rest/v1/${table}?select=id`, {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json', prefer: 'return=representation', accept: 'application/json' }),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const rows = (await res.json()) as Row[];
        const id = rows[0]?.id;
        if (typeof id !== 'string') throw new OhgoRequestError(`${table} 저장 응답에 id가 없습니다`, 502);
        return id;
      }
      const err = await errorFrom(res, `${table} 저장`);
      const missing = /'([a-z_]+)' column/.exec(err.message)?.[1];
      if (missing && optionalColumns.includes(missing) && missing in body) {
        delete body[missing];
        continue;
      }
      throw err;
    }
  }

  async deleteRow(table: string, id: string): Promise<void> {
    const res = await this.fetchImpl(`${this.cfg.supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) throw await errorFrom(res, `${table} 삭제`);
  }

  async uploadPhoto(path: string, bytes: Buffer, contentType: string): Promise<string> {
    const res = await this.fetchImpl(`${this.cfg.supabaseUrl}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': contentType, 'x-upsert': 'false', 'cache-control': 'max-age=3600' }),
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw await errorFrom(res, '사진 업로드');
    return publicPhotoUrl(this.cfg.supabaseUrl, path);
  }

  /**
   * 지운 경로를 돌려준다. Storage는 권한이 없어 못 지운 파일을 오류 없이 빼고 답하므로
   * 돌려받은 목록이 짧으면 그만큼 남아 있는 것이다.
   */
  async removePhotos(paths: string[]): Promise<string[]> {
    if (paths.length === 0) return [];
    const res = await this.fetchImpl(`${this.cfg.supabaseUrl}/storage/v1/object/${PHOTO_BUCKET}`, {
      method: 'DELETE',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) throw await errorFrom(res, '올린 사진 정리');
    const removed = (await res.json().catch(() => [])) as { name?: unknown }[];
    const names = new Set(Array.isArray(removed) ? removed.map((o) => String(o?.name ?? '')) : []);
    return paths.filter((p) => names.has(p));
  }
}
