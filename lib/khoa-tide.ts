import { getTideRegion } from '@/lib/dadaepo-tide';
import {
  parseKstDateTime,
  type TideCurveAnchor,
  type TideEventType,
  type TideForecastEvent,
  type TideForecastPayload,
} from '@/lib/tide-forecast';

const KHOA_TIDE_URL = 'https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService';

type KhoaTideItem = {
  obsvtrNm?: string;
  predcDt?: string;
  predcTdlvVl?: number | string;
  extrSe?: string | number;
};

function serviceKeyQueryValue(): string | null {
  const raw = process.env.KHOA_TIDE_API_KEY?.trim();
  if (!raw) return null;
  if (/%[0-9A-Fa-f]{2}/.test(raw)) return raw;
  return encodeURIComponent(raw);
}

function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseEventType(value: unknown): TideEventType | null {
  const raw = String(value ?? '').trim();
  if (raw === '1' || raw === '3' || raw.includes('고')) return 'high';
  if (raw === '2' || raw === '4' || raw.includes('저')) return 'low';
  return null;
}

function parseHeightCm(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function parseClock(predcDt: string): string | null {
  const match = /(\d{1,2}):(\d{2})/.exec(predcDt);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function parseDateTime(predcDt: string): number {
  return parseKstDateTime(predcDt);
}

function asItemList(value: unknown): KhoaTideItem[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as KhoaTideItem[];
  if (typeof value === 'object') return [value as KhoaTideItem];
  return [];
}

async function fetchKhoaDay(obsCode: string, dateStr: string): Promise<KhoaTideItem[]> {
  const serviceKey = serviceKeyQueryValue();
  if (!serviceKey) return [];

  const ymd = dateStr.replace(/-/g, '');
  const url =
    `${KHOA_TIDE_URL}?serviceKey=${serviceKey}` +
    `&type=json&obsCode=${encodeURIComponent(obsCode)}` +
    `&reqDate=${ymd}&numOfRows=20&pageNo=1`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 3600 },
  });
  if (!response.ok) return [];

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }

  const root = (data as { response?: unknown })?.response ?? data;
  const header = (root as { header?: { resultCode?: string } })?.header;
  if (header?.resultCode && header.resultCode !== '00') return [];

  const body = (root as { body?: { items?: { item?: unknown } } })?.body;
  return asItemList(body?.items?.item);
}

function toEvents(items: KhoaTideItem[]): Array<TideForecastEvent & { at: number }> {
  return items
    .map((item) => {
      const type = parseEventType(item.extrSe);
      const time = item.predcDt ? parseClock(item.predcDt) : null;
      const heightCm = parseHeightCm(item.predcTdlvVl);
      if (!type || !time || heightCm == null) return null;
      return {
        type,
        time,
        heightCm,
        deltaCm: null,
        at: item.predcDt ? parseDateTime(item.predcDt) : 0,
      };
    })
    .filter((item): item is TideForecastEvent & { at: number } => item != null)
    .sort((a, b) => a.at - b.at || a.time.localeCompare(b.time));
}

function withDeltas(
  today: Array<TideForecastEvent & { at: number }>,
  yesterday: Array<TideForecastEvent & { at: number }>,
): TideForecastEvent[] {
  const history = [...yesterday, ...today];
  return today.map((event, index) => {
    const cursor = yesterday.length + index;
    let previous: (typeof history)[number] | undefined;
    for (let i = cursor - 1; i >= 0; i -= 1) {
      if (history[i].type === event.type) {
        previous = history[i];
        break;
      }
    }
    return {
      type: event.type,
      time: event.time,
      heightCm: event.heightCm,
      deltaCm: previous ? event.heightCm - previous.heightCm : null,
      at: event.at,
    };
  });
}

function toAnchors(items: Array<{ at: number; heightCm: number; type: TideEventType }>): TideCurveAnchor[] {
  return items
    .filter((item) => item.at > 0)
    .map((item) => ({ at: item.at, heightCm: item.heightCm, type: item.type }));
}

export async function getTideForecast(dateStr: string, regionId?: string | null): Promise<TideForecastPayload> {
  const region = getTideRegion(regionId);
  const [todayItems, yesterdayItems, tomorrowItems] = await Promise.all([
    fetchKhoaDay(region.obsCode, dateStr),
    fetchKhoaDay(region.obsCode, shiftDate(dateStr, -1)),
    fetchKhoaDay(region.obsCode, shiftDate(dateStr, 1)),
  ]);
  const today = toEvents(todayItems);
  const yesterday = toEvents(yesterdayItems);
  const tomorrow = toEvents(tomorrowItems);
  const events = withDeltas(today, yesterday);
  return {
    ok: true,
    date: dateStr,
    region: {
      id: region.id,
      label: region.label,
      stationLabel: region.stationLabel,
    },
    events,
    anchors: toAnchors([...yesterday, ...today, ...tomorrow]),
  };
}
