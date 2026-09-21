export type TideEventType = 'high' | 'low';

export type TideForecastEvent = {
  type: TideEventType;
  time: string;
  heightCm: number;
  deltaCm: number | null;
  at: number;
};

/** 국립해양조사원 조석 시각은 한국 표준시(KST, UTC+9). */
export const KST_OFFSET = '+09:00';
export const TIDE_SLACK_MS = 60 * 60 * 1000;

export type TideSlackWindow = {
  event: TideForecastEvent;
  from: number;
  to: number;
  clipFrom: number;
  clipTo: number;
};

/** KHOA predcDt 등 타임존 없는 시각을 KST로 해석한다. 서버 TZ(UTC)에 영향받지 않는다. */
export function parseKstDateTime(value: string): number {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const stamped = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
    ? normalized
    : `${normalized}${KST_OFFSET}`;
  const ms = Date.parse(stamped);
  return Number.isNaN(ms) ? 0 : ms;
}

/** YYYY-MM-DD의 KST 시각을 epoch ms로. */
export function kstDateTimeMs(date: string, hour: number, minute = 0): number {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return parseKstDateTime(`${date}T${hh}:${mm}:00`);
}

export function formatKstClock(at: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at));
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/** 만조·간조 모두 ±1시간 물돌이 구간. */
export function slackWindows(
  events: TideForecastEvent[],
  viewStart: number,
  viewEnd: number,
): TideSlackWindow[] {
  return events
    .map((event) => {
      const from = event.at - TIDE_SLACK_MS;
      const to = event.at + TIDE_SLACK_MS;
      if (to <= viewStart || from >= viewEnd) return null;
      return {
        event,
        from,
        to,
        clipFrom: Math.max(from, viewStart),
        clipTo: Math.min(to, viewEnd),
      };
    })
    .filter((item): item is TideSlackWindow => item != null);
}

export type TideCurveAnchor = {
  at: number;
  heightCm: number;
  type: TideEventType;
};

export function interpolateTideCurve(
  anchors: TideCurveAnchor[],
  samplesPerSegment = 32,
): Array<{ at: number; heightCm: number }> {
  const sorted = [...anchors].sort((a, b) => a.at - b.at);
  if (sorted.length === 0) return [];
  if (sorted.length === 1) return [{ at: sorted[0].at, heightCm: sorted[0].heightCm }];

  const out: Array<{ at: number; heightCm: number }> = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    for (let step = 0; step < samplesPerSegment; step += 1) {
      const u = step / samplesPerSegment;
      out.push({
        at: from.at + (to.at - from.at) * u,
        heightCm:
          (from.heightCm + to.heightCm) / 2 +
          ((from.heightCm - to.heightCm) / 2) * Math.cos(Math.PI * u),
      });
    }
  }
  const last = sorted[sorted.length - 1];
  out.push({ at: last.at, heightCm: last.heightCm });
  return out;
}

export type TideForecastPayload = {
  ok: true;
  date: string;
  region: {
    id: string;
    label: string;
    stationLabel: string;
  };
  events: TideForecastEvent[];
  anchors: TideCurveAnchor[];
};
