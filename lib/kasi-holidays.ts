import {
  fallbackHolidays,
  HOLIDAY_DATE_RE,
  mergeHolidays,
  type KrHoliday,
  type KrHolidayYearPayload,
} from '@/lib/kr-holidays';

/** 한국천문연구원 특일정보 (공공데이터포털 SpcdeInfoService) */
const KASI_REST_DE_URL =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

export const HOLIDAYS_TABLE = 'holidays';

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** KASI 실패 후 재시도 간격. 요청마다 외부 API를 두드리지 않게 한다. */
const FAILURE_BACKOFF_MS = 60 * 60 * 1000;
/** 같은 프로세스 안에서 저장소 재조회 간격 */
const MEMO_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

export const MIN_HOLIDAY_YEAR = 2000;
export const MAX_HOLIDAY_YEAR = 2100;

export type StoredHolidayYear = {
  year: number;
  holidays: KrHoliday[];
  fetchedAt: string;
};

export type HolidayStore = {
  read(year: number): Promise<StoredHolidayYear | null>;
  write(row: StoredHolidayYear): Promise<void>;
};

type KasiItem = {
  dateName?: unknown;
  isHoliday?: unknown;
  locdate?: unknown;
};

/** 저장된 키는 이미 URL 인코딩된 값이다. 다시 인코딩하면 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 가 난다. */
function serviceKeyQueryValue(): string | null {
  const raw = process.env.KASI_HOLIDAY_API_KEY?.trim() || process.env.KHOA_TIDE_API_KEY?.trim() || '';
  return raw || null;
}

export function hasKasiServiceKey(): boolean {
  return serviceKeyQueryValue() !== null;
}

function locdateToDateStr(value: unknown): string | null {
  const digits = String(value ?? '').trim();
  if (!/^\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function asItemList(value: unknown): KasiItem[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as KasiItem[];
  if (typeof value === 'object') return [value as KasiItem];
  return [];
}

/**
 * getRestDeInfo JSON 응답을 공휴일 목록으로 바꾼다.
 * isHoliday==='Y' 만 남기고 같은 날 이름은 합친다. 응답 형식이 틀리면 throw.
 */
export function parseKasiRestDeResponse(json: unknown, year?: number): KrHoliday[] {
  const response = (json as { response?: Record<string, unknown> } | null)?.response;
  if (!response || typeof response !== 'object') {
    throw new Error('KASI 응답 형식이 올바르지 않습니다.');
  }
  const header = response.header as { resultCode?: unknown; resultMsg?: unknown } | undefined;
  const code = String(header?.resultCode ?? '');
  if (code && code !== '00' && code !== '0000') {
    throw new Error(`KASI 오류 ${code}: ${String(header?.resultMsg ?? '')}`);
  }
  const body = response.body as { items?: unknown } | undefined;
  const itemsNode = body?.items;
  const rawItems =
    itemsNode && typeof itemsNode === 'object'
      ? asItemList((itemsNode as { item?: unknown }).item)
      : [];

  const holidays: KrHoliday[] = [];
  for (const item of rawItems) {
    if (String(item.isHoliday ?? '').trim() !== 'Y') continue;
    const date = locdateToDateStr(item.locdate);
    const name = String(item.dateName ?? '').trim();
    if (!date || !name) continue;
    if (year !== undefined && !date.startsWith(`${year}-`)) continue;
    holidays.push({ date, name });
  }
  return mergeHolidays(holidays);
}

export async function fetchKasiHolidays(
  year: number,
  fetchImpl: typeof fetch = fetch,
): Promise<KrHoliday[]> {
  const serviceKey = serviceKeyQueryValue();
  if (!serviceKey) throw new Error('KASI_HOLIDAY_API_KEY 가 없습니다.');

  const url =
    `${KASI_REST_DE_URL}?serviceKey=${serviceKey}` +
    `&solYear=${year}&numOfRows=100&pageNo=1&_type=json`;

  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`KASI HTTP ${response.status}`);
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('KASI 응답이 JSON 이 아닙니다.');
  }
  return parseKasiRestDeResponse(json, year);
}

function normalizeStoredHolidays(value: unknown): KrHoliday[] {
  if (!Array.isArray(value)) return [];
  const list: KrHoliday[] = [];
  for (const row of value) {
    const date = String((row as { date?: unknown })?.date ?? '');
    const name = String((row as { name?: unknown })?.name ?? '').trim();
    if (HOLIDAY_DATE_RE.test(date) && name) list.push({ date, name });
  }
  return mergeHolidays(list);
}

export function createSupabaseHolidayStore(): HolidayStore | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const client = async () => (await import('@/lib/supabase/admin')).createAdminClient();
  return {
    async read(year) {
      const { data, error } = await (await client())
        .from(HOLIDAYS_TABLE)
        .select('year, holidays, fetched_at')
        .eq('year', year)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as { year: number; holidays: unknown; fetched_at: string };
      return {
        year: row.year,
        holidays: normalizeStoredHolidays(row.holidays),
        fetchedAt: row.fetched_at,
      };
    },
    async write(row) {
      const { error } = await (await client())
        .from(HOLIDAYS_TABLE)
        .upsert(
          { year: row.year, holidays: row.holidays, fetched_at: row.fetchedAt },
          { onConflict: 'year' },
        );
      if (error) throw error;
    },
  };
}

export function kstYear(now: Date): number {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCFullYear();
}

/** 지난 해는 다시 받지 않는다. 올해 이후는 하루 한 번까지 갱신한다 (임시공휴일 반영). */
export function needsKasiRefresh(year: number, stored: StoredHolidayYear | null, now: Date): boolean {
  if (!stored) return true;
  if (year < kstYear(now)) return false;
  const fetchedAt = Date.parse(stored.fetchedAt);
  if (!Number.isFinite(fetchedAt)) return true;
  return now.getTime() - fetchedAt >= REFRESH_INTERVAL_MS;
}

type MemoEntry = { payload: KrHolidayYearPayload; checkedAt: number };
const memo = new Map<number, MemoEntry>();
const lastFailureAt = new Map<number, number>();
const inflight = new Map<number, Promise<KrHolidayYearPayload>>();

export function resetHolidayMemo(): void {
  memo.clear();
  lastFailureAt.clear();
  inflight.clear();
}

export type GetHolidayYearOptions = {
  store?: HolidayStore | null;
  fetchImpl?: typeof fetch;
  now?: Date;
};

async function resolveHolidayYear(
  year: number,
  opts: GetHolidayYearOptions,
): Promise<KrHolidayYearPayload> {
  const now = opts.now ?? new Date();
  const store = opts.store === undefined ? createSupabaseHolidayStore() : opts.store;

  let stored: StoredHolidayYear | null = null;
  if (store) {
    try {
      stored = await store.read(year);
    } catch (error) {
      console.error('[holidays] store read failed', error instanceof Error ? error.message : error);
    }
  }

  const failedAt = lastFailureAt.get(year);
  const inBackoff = failedAt !== undefined && now.getTime() - failedAt < FAILURE_BACKOFF_MS;

  if (needsKasiRefresh(year, stored, now) && hasKasiServiceKey() && !inBackoff) {
    try {
      const holidays = await fetchKasiHolidays(year, opts.fetchImpl);
      if (holidays.length === 0) throw new Error(`KASI ${year}년 공휴일이 비어 있습니다.`);
      const fetchedAt = now.toISOString();
      lastFailureAt.delete(year);
      if (store) {
        try {
          await store.write({ year, holidays, fetchedAt });
        } catch (error) {
          console.error('[holidays] store write failed', error instanceof Error ? error.message : error);
        }
      }
      return { year, holidays, source: 'kasi', fetchedAt };
    } catch (error) {
      lastFailureAt.set(year, now.getTime());
      console.error('[holidays] KASI fetch failed', error instanceof Error ? error.message : error);
    }
  }

  if (stored && stored.holidays.length > 0) {
    return { year, holidays: stored.holidays, source: 'stored', fetchedAt: stored.fetchedAt };
  }

  const fallback = fallbackHolidays(year);
  if (fallback) return { year, holidays: mergeHolidays(fallback), source: 'fallback', fetchedAt: null };

  return { year, holidays: [], source: 'none', fetchedAt: null };
}

export async function getHolidayYear(
  year: number,
  opts: GetHolidayYearOptions = {},
): Promise<KrHolidayYearPayload> {
  const now = (opts.now ?? new Date()).getTime();
  const hit = memo.get(year);
  if (hit && now - hit.checkedAt < MEMO_TTL_MS) return hit.payload;

  const pending = inflight.get(year);
  if (pending) return pending;

  const promise = resolveHolidayYear(year, opts)
    .then((payload) => {
      memo.set(year, { payload, checkedAt: now });
      return payload;
    })
    .finally(() => {
      inflight.delete(year);
    });
  inflight.set(year, promise);
  return promise;
}
