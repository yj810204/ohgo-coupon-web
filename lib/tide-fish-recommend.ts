import { getTideFlowLevel, getTideLabel, type TideRegion } from '@/lib/dadaepo-tide';
import type { TideForecastEvent } from '@/lib/tide-forecast';

export const TIDE_FISH_GROUND = '다대포항 내만권 선상 · 수심 15–20m';
export const DEFAULT_DEPARTURE = '06:00';

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
};

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
  const kn = Math.round((baseCurrentKn(options.label) * (0.22 + 0.78 * factor)) * 100) / 100;
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
  const flow = getTideFlowLevel(label);
  const timing =
    current.phase === '거의 정조'
      ? '정조 전후라 채비가 잘 서니 바닥 긁기를 길게 가져가세요.'
      : current.phase === '중조'
        ? '중조라 채비가 밀립니다. 수중을 한 호 올리고 목줄을 짧게 보세요.'
        : '초·말물이라 입질 타이밍입니다. 전유동으로 층을 훑어 보세요.';

  return {
    species,
    headline: [
      `${eun(label)} 다대포 내만 선상(15–20m) 기준입니다.`,
      `출항 ${current.departureTime}`,
      `조류 ${current.label}`,
    ].join('\n'),
    tips: [
      timing,
      `대상은 ${species.join('·')}입니다.\n밑밥은 좁게, 미끼는 크릴·청갯지렁이 위주로 보세요.`,
      flow >= 7
        ? '사리 전후 내만은 조류가 셉니다.\n구멍찌(막대찌)는 2.5~3호로 한 호 올려 보세요.'
        : '기본 찌는 2호입니다.\n조류가 약하면 1.5호, 세면 2.5호로 한 호만 가감하세요.',
    ],
    source: 'rules',
    ground: `${region.label} · ${TIDE_FISH_GROUND}`,
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
