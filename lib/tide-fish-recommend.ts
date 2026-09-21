import { getTideLabel, type TideRegion } from '@/lib/dadaepo-tide';
import type { TideCurveAnchor, TideForecastEvent } from '@/lib/tide-forecast';

export const TIDE_FISH_GROUND = '다대포항 내만권 선상/수심 15–20m';
export const DEFAULT_DEPARTURE = '06:00';

export function recommendedRigFlow(rig: string): '전유동' | '반유동' {
  return rig.includes('전유동') ? '전유동' : '반유동';
}

export function formatTideGround(region: TideRegion): string {
  if (region.id === 'dadaepo') return '부산 다대포항 내만권 선상/수심 15–20m';
  return `${region.label} 내만권 선상/수심 15–20m`;
}

export type TideFishAdvice = {
  species: string[];
  headline: string;
  tips: string[];
  source: 'rules' | 'ai';
  ground: string;
  departureTime: string;
  currentKn: number;
  currentLabel: string;
  rig: string;
  locked?: boolean;
  lockMessage?: string;
};

export function formatAdviceBriefing(advice: Pick<TideFishAdvice, 'headline' | 'tips'>): string {
  return [advice.headline, ...advice.tips]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

export const TIDE_AI_CACHE_VERSION = 'v7';
export const TIDE_AI_MAX_AHEAD_DAYS = 2;
export const TIDE_AI_LOCK_MESSAGE = 'AI 추천은 오늘부터 이틀 뒤까지만 볼 수 있습니다.';

export function shiftTideDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isTideAiDateOpen(date: string, today: string): boolean {
  return date >= today && date <= shiftTideDate(today, TIDE_AI_MAX_AHEAD_DAYS);
}

export function tideAiCacheKey(date: string, regionId: string, depart: string): string {
  return `${TIDE_AI_CACHE_VERSION}:${date}:${regionId}:${depart}`;
}

export type TideFishAdviceInput = {
  events?: TideForecastEvent[];
  departureTime?: string;
};

function eun(label: string): string {
  if (label === '사리' || label === '조금') return `${label}는`;
  return `${label}은`;
}

function parseHm(value?: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatHm(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);
  const min = wrapped % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** 내만 15–20m 기준 몇물 최대 조류(노트). 외해보다 약하게 잡는다. */
function baseCurrentKn(label: string): number {
  const byLabel: Record<string, number> = {
    조금: 0.18,
    '1물': 0.26,
    '14물': 0.26,
    '2물': 0.34,
    '13물': 0.34,
    '3물': 0.42,
    '12물': 0.42,
    '4물': 0.52,
    '11물': 0.52,
    '5물': 0.64,
    '10물': 0.64,
    '6물': 0.78,
    '9물': 0.78,
    '7물': 0.95,
    사리: 1.08,
  };
  return byLabel[label] ?? 0.4;
}

/**
 * 고저차(cm)/소요시간(h) → 중조 추정 노트.
 * 다대포 내만: 100cm / 6h ≈ 0.5kn. 실측 조류가 아니라 조위 기반 추정.
 */
const KN_PER_CM_PER_HOUR = 0.03;

type TideExchange = {
  rangeCm: number;
  hours: number;
  fromAt: number;
  toAt: number;
};

function tideMarks(
  events?: TideForecastEvent[],
  anchors?: TideCurveAnchor[],
): Array<{ at: number; heightCm: number; type: 'high' | 'low' }> {
  if (anchors && anchors.length >= 2) {
    return [...anchors].sort((a, b) => a.at - b.at);
  }
  return [...(events ?? [])].sort((a, b) => a.at - b.at);
}

function tideExchanges(events?: TideForecastEvent[], anchors?: TideCurveAnchor[]): TideExchange[] {
  const sorted = tideMarks(events, anchors);
  if (sorted.length < 2) return [];
  const out: TideExchange[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (prev.type === next.type) continue;
    const hours = (next.at - prev.at) / 3_600_000;
    if (hours < 2 || hours > 10) continue;
    out.push({
      rangeCm: Math.abs(next.heightCm - prev.heightCm),
      hours,
      fromAt: prev.at,
      toAt: next.at,
    });
  }
  return out;
}

function pickTideExchange(exchanges: TideExchange[], date?: string): TideExchange | null {
  if (exchanges.length === 0) return null;
  const boatStart = date ? Date.parse(`${date}T04:00:00`) : null;
  const boatEnd = date ? Date.parse(`${date}T18:00:00`) : null;
  const pool = boatStart != null && boatEnd != null
    ? exchanges.filter((item) => item.toAt > boatStart && item.fromAt < boatEnd)
    : exchanges;
  const ranked = pool.length > 0 ? pool : exchanges;
  return ranked.reduce((best, item) => (
    item.rangeCm / item.hours > best.rangeCm / best.hours ? item : best
  ));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function flowLevelFromKn(kn: number): number {
  return Math.max(1, Math.min(8, Math.round(1 + 7 * clamp((kn - 0.15) / 0.95, 0, 1))));
}

export function tideFlowFeel(kn: number): string {
  if (kn < 0.25) return '거의 안 흐름';
  if (kn < 0.4) return '약하게 흐름';
  if (kn < 0.65) return '보통으로 흐름';
  if (kn < 0.9) return '꽤 흐름';
  return '세게 흐름';
}

export type DayTideFlow = {
  peakKn: number;
  rangeCm: number | null;
  hours: number | null;
  level: number;
  source: 'range' | 'mul';
};

/** 그날 중조 최대 조류. 고저차가 있으면 조위 우선, 없으면 몇물. */
export function estimateDayTideFlow(
  label: string,
  events?: TideForecastEvent[],
  date?: string,
  anchors?: TideCurveAnchor[],
): DayTideFlow {
  const mulPeak = baseCurrentKn(label);
  const exchange = pickTideExchange(tideExchanges(events, anchors), date);
  if (!exchange) {
    return {
      peakKn: mulPeak,
      rangeCm: null,
      hours: null,
      level: flowLevelFromKn(mulPeak),
      source: 'mul',
    };
  }
  const fromRange = clamp((exchange.rangeCm / exchange.hours) * KN_PER_CM_PER_HOUR, 0.12, 2.4);
  const peakKn = Math.round((fromRange * 0.8 + mulPeak * 0.2) * 100) / 100;
  return {
    peakKn,
    rangeCm: Math.round(exchange.rangeCm),
    hours: Math.round(exchange.hours * 10) / 10,
    level: flowLevelFromKn(peakKn),
    source: 'range',
  };
}

/** 만조·간조에 가깝면 0, 중조(중간)면 1 */
function slackFactor(events: TideForecastEvent[] | undefined, departMin: number): number {
  if (!events || events.length === 0) return 0.65;
  const marks = events
    .map((event) => {
      const minutes = parseHm(event.time);
      return minutes == null ? null : { minutes, type: event.type };
    })
    .filter((item): item is { minutes: number; type: 'high' | 'low' } => item != null)
    .sort((a, b) => a.minutes - b.minutes);
  if (marks.length === 0) return 0.65;

  let prev = marks[0];
  let next = marks[marks.length - 1];
  for (let i = 0; i < marks.length; i += 1) {
    if (marks[i].minutes <= departMin) prev = marks[i];
    if (marks[i].minutes >= departMin) {
      next = marks[i];
      break;
    }
  }
  if (next.minutes === prev.minutes) {
    const after = marks.find((item) => item.minutes > departMin) ?? { minutes: prev.minutes + 360, type: prev.type };
    next = after;
  }
  const span = Math.max(30, next.minutes - prev.minutes);
  const pos = Math.min(1, Math.max(0, (departMin - prev.minutes) / span));
  return Math.sin(pos * Math.PI);
}

export function estimateTideCurrent(options: {
  label: string;
  events?: TideForecastEvent[];
  departureTime?: string;
}): { kn: number; label: string; phase: string; departureTime: string } {
  const departureTime = options.departureTime && parseHm(options.departureTime) != null
    ? options.departureTime
    : DEFAULT_DEPARTURE;
  const departMin = parseHm(departureTime) ?? 6 * 60;
  const factor = slackFactor(options.events, departMin);
  const dayFlow = estimateDayTideFlow(options.label, options.events);
  const kn = Math.round((dayFlow.peakKn * (0.22 + 0.78 * factor)) * 100) / 100;
  const phase = factor < 0.25 ? '거의 정조' : factor < 0.55 ? '초·말물' : '중조';
  const strength = kn < 0.3 ? '약함' : kn < 0.6 ? '보통' : '강함';
  return {
    kn,
    label: `${kn.toFixed(2)}kn · ${strength} · ${phase}`,
    phase,
    departureTime,
  };
}

function boatSpecies(month: number): string[] {
  if (month >= 9 && month <= 11) return ['감성돔', '노래미', '볼락'];
  if (month >= 12 || month <= 2) return ['감성돔', '볼락', '학꽁치'];
  if (month >= 3 && month <= 5) return ['감성돔', '도다리', '노래미'];
  return ['볼락', '전갱이', '노래미'];
}

function floatRig(kn: number): string {
  if (kn < 0.3) {
    return '1.5~2호 구멍찌(막대찌) · 전유동 · 수중 G2';
  }
  if (kn < 0.6) {
    return '2호 구멍찌(막대찌) · 반유동 · 수중 2B';
  }
  return '2.5~3호 구멍찌(막대찌) · 반유동 고정 · 수중 3B';
}

function leaderAndShot(kn: number): { leader: string; shot: string; how: string } {
  if (kn < 0.3) {
    return {
      leader: '2.5~3m',
      shot: 'B~G2',
      how: '찌를 배에서 멀리 흘려 층을 훑고, 멈칫하면 한 번만 견제하세요.',
    };
  }
  if (kn < 0.6) {
    return {
      leader: '1.8~2.2m',
      shot: 'G2',
      how: '원하는 수심에 미끼가 머물게 반유동으로 잡고, 밀리면 수중을 한 호 올리세요.',
    };
  }
  return {
    leader: '1.5m',
    shot: 'G3~2B',
    how: '목줄을 짧게 잡고 바닥을 긁지 않게 수중을 올려 고정하세요.',
  };
}

export function getTideFishAdvice(
  dateStr: string,
  region: TideRegion,
  input: TideFishAdviceInput = {},
): TideFishAdvice | null {
  const label = getTideLabel(dateStr);
  if (!label) return null;
  const month = Number(dateStr.slice(5, 7));
  const species = boatSpecies(month);
  const current = estimateTideCurrent({
    label,
    events: input.events,
    departureTime: input.departureTime,
  });
  const rig = floatRig(current.kn);
  const kit = leaderAndShot(current.kn);
  const flowName = recommendedRigFlow(rig);

  return {
    species,
    headline: [
      `${eun(label)} 출항 ${current.departureTime}, 조류 ${current.label}.`,
      `오늘은 ${flowName}. 구멍찌는 ${rig.split(' · ')[0]}, 목줄 ${kit.leader}, 좁쌀봉돌 ${kit.shot}.`,
      kit.how,
      '물색이 맑으면 목줄을 조금 더 길게 하고 미끼는 작게, 탁하면 목줄을 짧게 잡고 밑밥을 앞에 두세요.',
    ].join('\n'),
    tips: [],
    source: 'rules',
    ground: formatTideGround(region),
    departureTime: current.departureTime,
    currentKn: current.kn,
    currentLabel: current.label,
    rig,
  };
}

export function isTideFishAdvice(value: unknown): value is TideFishAdvice {
  if (!value || typeof value !== 'object') return false;
  const item = value as TideFishAdvice;
  return (
    Array.isArray(item.species) &&
    item.species.length > 0 &&
    item.species.every((name) => typeof name === 'string' && name.trim().length > 0) &&
    typeof item.headline === 'string' &&
    item.headline.trim().length > 0 &&
    Array.isArray(item.tips) &&
    item.tips.every((tip) => typeof tip === 'string') &&
    (item.source === 'ai' || item.source === 'rules')
  );
}

export function normalizeDepartQuery(value: string | null): string | undefined {
  if (!value || parseHm(value) == null) return undefined;
  return formatHm(parseHm(value) ?? 0);
}
