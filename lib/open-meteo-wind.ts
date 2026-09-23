import { BUSINESS_TIME_ZONE, KST_OFFSET } from '@/lib/kst-date';

export const OPEN_METEO_LAT = 35.043;
export const OPEN_METEO_LON = 128.986;
export const OPEN_METEO_MODEL = 'ecmwf_ifs025';
export const OPEN_METEO_TIMEZONE = BUSINESS_TIME_ZONE;
export const OPEN_METEO_CACHE_TTL_SEC = 3600;
export const OPEN_METEO_ATTRIBUTION = 'Open-Meteo / ECMWF IFS';

export const WIND_WINDOWS = [
  { id: 'am6', label: '오전 06–12', hours: [6, 7, 8, 9, 10, 11, 12] },
  { id: 'pm14', label: '오후 14–18', hours: [14, 15, 16, 17, 18] },
] as const;

export type WindGrade = '양호' | '주의' | '불리' | '강풍';
export type WindWindowId = (typeof WIND_WINDOWS)[number]['id'];

export type WindWindow = {
  id: WindWindowId;
  label: string;
  avgMs: number | null;
  gustMaxMs: number | null;
  dirDeg: number | null;
  dirText: string;
  grade: WindGrade | null;
  hourCount: number;
};

export type WindHourPoint = {
  hour: number;
  speed: number | null;
  gust: number | null;
  dirDeg: number | null;
  dirText: string;
  weatherCode: number | null;
};

export type WindWeatherPayload = {
  ok: true;
  date: string;
  coords: { request: [number, number]; grid: [number, number] };
  model: string;
  timezone: string;
  windows: WindWindow[];
  hours: WindHourPoint[];
  weatherCodeMax: number | null;
  weatherText: string;
  precipMmSum: number | null;
  attribution: string;
  fetchedAt: string;
  cacheTtlSec: number;
};

export type WindWeatherError = {
  ok: false;
  error: string;
};

export type WindWeatherResponse = WindWeatherPayload | WindWeatherError;

export type OpenMeteoHourly = {
  time?: unknown;
  [key: string]: unknown;
};

export type OpenMeteoForecast = {
  latitude?: unknown;
  longitude?: unknown;
  timezone?: unknown;
  hourly?: OpenMeteoHourly | null;
};

const DIR_16 = [
  '북',
  '북북동',
  '북동',
  '동북동',
  '동',
  '동남동',
  '남동',
  '남남동',
  '남',
  '남남서',
  '남서',
  '서남서',
  '서',
  '서북서',
  '북서',
  '북북서',
] as const;

export function isWindWeatherPayload(value: unknown): value is WindWeatherPayload {
  if (!value || typeof value !== 'object') return false;
  const row = value as { ok?: unknown; date?: unknown; windows?: unknown };
  return row.ok === true && typeof row.date === 'string' && Array.isArray(row.windows);
}

export function windGrade(avgMs: number, gustMaxMs: number): WindGrade {
  if (avgMs > 8 || gustMaxMs > 15) return '강풍';
  if (avgMs > 6 || gustMaxMs > 12) return '불리';
  if (avgMs > 4 || gustMaxMs > 8) return '주의';
  return '양호';
}

export function windDirText(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return DIR_16[index];
}

export function weatherCodeText(code: number): string {
  if (code === 0) return '맑음';
  if (code === 1) return '대체로 맑음';
  if (code === 2) return '구름 조금';
  if (code === 3) return '흐림';
  if (code === 45 || code === 48) return '안개';
  if (code >= 51 && code <= 57) return '이슬비';
  if (code >= 61 && code <= 67) return '비';
  if (code >= 71 && code <= 77) return '눈';
  if (code >= 80 && code <= 82) return '소나기';
  if (code === 85 || code === 86) return '눈';
  if (code >= 95) return '뇌우';
  return '';
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function circularMeanDeg(degrees: number[]): number | null {
  if (degrees.length === 0) return null;
  let sinSum = 0;
  let cosSum = 0;
  for (const deg of degrees) {
    const rad = (deg * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const mean = (Math.atan2(sinSum / degrees.length, cosSum / degrees.length) * 180) / Math.PI;
  return ((mean % 360) + 360) % 360;
}

function asFiniteNumbers(value: unknown): Array<number | null> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item == null) return null;
    const n = typeof item === 'number' ? item : Number(item);
    return Number.isFinite(n) ? n : null;
  });
}

function asTimeStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? ''));
}

/** models= 지정 시 접미사가 붙는 응답과 기본 키를 모두 허용한다. */
export function hourlySeries(hourly: OpenMeteoHourly, base: string): Array<number | null> {
  const direct = asFiniteNumbers(hourly[base]);
  if (direct.length > 0) return direct;
  const suffixed = asFiniteNumbers(hourly[`${base}_${OPEN_METEO_MODEL}`]);
  if (suffixed.length > 0) return suffixed;
  for (const [key, value] of Object.entries(hourly)) {
    if (key === base || key.startsWith(`${base}_`)) {
      const series = asFiniteNumbers(value);
      if (series.length > 0) return series;
    }
  }
  return [];
}

function parseHourStamp(iso: string): { date: string; hour: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})/.exec(iso);
  if (!match) return null;
  return { date: match[1], hour: Number(match[2]) };
}

function formatKstIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}${KST_OFFSET}`;
}

function asCoord(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function aggregateWindWindow(
  hours: number[],
  points: Array<{ hour: number; speed: number | null; gust: number | null; dir: number | null }>,
): { avgMs: number | null; gustMaxMs: number | null; dirDeg: number | null; hourCount: number } {
  const wanted = new Set(hours);
  const speeds: number[] = [];
  const gusts: number[] = [];
  const dirs: number[] = [];
  for (const point of points) {
    if (!wanted.has(point.hour)) continue;
    if (point.speed != null) speeds.push(point.speed);
    if (point.gust != null) gusts.push(point.gust);
    if (point.dir != null) dirs.push(point.dir);
  }
  const avgMs = speeds.length > 0 ? round1(speeds.reduce((sum, n) => sum + n, 0) / speeds.length) : null;
  const gustMaxMs = gusts.length > 0 ? round1(Math.max(...gusts)) : null;
  const dirMean = circularMeanDeg(dirs);
  return {
    avgMs,
    gustMaxMs,
    dirDeg: dirMean == null ? null : Math.round(dirMean),
    hourCount: speeds.length,
  };
}

export function buildWindWeatherPayload(
  date: string,
  raw: OpenMeteoForecast,
  fetchedAt: string = formatKstIso(),
): WindWeatherResponse {
  const hourly = raw.hourly;
  if (!hourly) return { ok: false, error: '바람 예보를 불러오지 못했습니다.' };

  const times = asTimeStrings(hourly.time);
  const speeds = hourlySeries(hourly, 'wind_speed_10m');
  const gusts = hourlySeries(hourly, 'wind_gusts_10m');
  const dirs = hourlySeries(hourly, 'wind_direction_10m');
  const codes = hourlySeries(hourly, 'weather_code');
  const precips = hourlySeries(hourly, 'precipitation');

  const dayPoints: Array<{
    hour: number;
    speed: number | null;
    gust: number | null;
    dir: number | null;
    code: number | null;
  }> = [];
  const dayCodes: number[] = [];
  let precipSum = 0;
  let precipSeen = false;

  for (let i = 0; i < times.length; i += 1) {
    const stamp = parseHourStamp(times[i]);
    if (!stamp || stamp.date !== date) continue;
    dayPoints.push({
      hour: stamp.hour,
      speed: speeds[i] ?? null,
      gust: gusts[i] ?? null,
      dir: dirs[i] ?? null,
      code: codes[i] ?? null,
    });
    const code = codes[i];
    if (code != null) dayCodes.push(code);
    const precip = precips[i];
    if (precip != null) {
      precipSeen = true;
      precipSum += precip;
    }
  }

  if (dayPoints.length === 0) {
    return { ok: false, error: '해당 날짜 바람 예보가 없습니다.' };
  }

  const windows: WindWindow[] = WIND_WINDOWS.map((spec) => {
    const agg = aggregateWindWindow([...spec.hours], dayPoints);
    const grade =
      agg.avgMs != null && agg.gustMaxMs != null ? windGrade(agg.avgMs, agg.gustMaxMs) : null;
    return {
      id: spec.id,
      label: spec.label,
      avgMs: agg.avgMs,
      gustMaxMs: agg.gustMaxMs,
      dirDeg: agg.dirDeg,
      dirText: agg.dirDeg == null ? '' : windDirText(agg.dirDeg),
      grade,
      hourCount: agg.hourCount,
    };
  });

  const weatherCodeMax = dayCodes.length > 0 ? Math.max(...dayCodes) : null;

  return {
    ok: true,
    date,
    coords: {
      request: [OPEN_METEO_LAT, OPEN_METEO_LON],
      grid: [round1(asCoord(raw.latitude, OPEN_METEO_LAT)), round1(asCoord(raw.longitude, OPEN_METEO_LON))],
    },
    model: OPEN_METEO_MODEL,
    timezone: typeof raw.timezone === 'string' && raw.timezone ? raw.timezone : OPEN_METEO_TIMEZONE,
    windows,
    weatherCodeMax,
    hours: dayPoints
      .filter((point) => point.hour >= 4 && point.hour <= 18)
      .map((point) => ({
        hour: point.hour,
        speed: point.speed == null ? null : round1(point.speed),
        gust: point.gust == null ? null : round1(point.gust),
        dirDeg: point.dir == null ? null : Math.round(point.dir),
        dirText: point.dir == null ? '' : windDirText(point.dir),
        weatherCode: point.code == null ? null : Math.round(point.code),
      })),
    weatherText: weatherCodeMax == null ? '' : weatherCodeText(weatherCodeMax),
    precipMmSum: precipSeen ? round1(precipSum) : null,
    attribution: OPEN_METEO_ATTRIBUTION,
    fetchedAt,
    cacheTtlSec: OPEN_METEO_CACHE_TTL_SEC,
  };
}

function openMeteoForecastUrl(kind: 'forecast' | 'previous-runs'): string {
  const apiKey = process.env.OPEN_METEO_API_KEY?.trim();
  const useCustomer = Boolean(apiKey) && kind === 'forecast';
  const base = useCustomer
    ? 'https://customer-api.open-meteo.com/v1/forecast'
    : kind === 'forecast'
      ? 'https://api.open-meteo.com/v1/forecast'
      : 'https://previous-runs-api.open-meteo.com/v1/forecast';
  const url = new URL(base);
  url.searchParams.set('latitude', String(OPEN_METEO_LAT));
  url.searchParams.set('longitude', String(OPEN_METEO_LON));
  url.searchParams.set(
    'hourly',
    'wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,precipitation',
  );
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('timezone', OPEN_METEO_TIMEZONE);
  url.searchParams.set('models', OPEN_METEO_MODEL);
  url.searchParams.set('cell_selection', 'sea');
  url.searchParams.set('forecast_days', '16');
  url.searchParams.set('past_days', '7');
  if (useCustomer && apiKey) url.searchParams.set('apikey', apiKey);
  return url.toString();
}

async function fetchOpenMeteoJson(url: string): Promise<OpenMeteoForecast> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: OPEN_METEO_CACHE_TTL_SEC },
  });
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`open-meteo invalid json (${response.status})`);
  }
  if (!response.ok || (data && typeof data === 'object' && (data as { error?: unknown }).error)) {
    const reason =
      data && typeof data === 'object' && typeof (data as { reason?: unknown }).reason === 'string'
        ? (data as { reason: string }).reason
        : `HTTP ${response.status}`;
    throw new Error(reason);
  }
  return data as OpenMeteoForecast;
}

export async function getOpenMeteoWind(date: string): Promise<WindWeatherResponse> {
  try {
    const raw = await fetchOpenMeteoJson(openMeteoForecastUrl('forecast'));
    return buildWindWeatherPayload(date, raw);
  } catch (primaryError) {
    try {
      const raw = await fetchOpenMeteoJson(openMeteoForecastUrl('previous-runs'));
      return buildWindWeatherPayload(date, raw);
    } catch {
      const message = primaryError instanceof Error ? primaryError.message : 'unknown';
      console.error('[weather] open-meteo failed', message);
      return { ok: false, error: '바람 예보를 불러오지 못했습니다.' };
    }
  }
}
