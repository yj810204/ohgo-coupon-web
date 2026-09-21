'use client';

import { useEffect, useState } from 'react';
import { IoChevronForwardOutline } from 'react-icons/io5';
import {
  getTideFlowLevel,
  getTideLabel,
  getTideRegion,
  getTideTextColor,
  type TideRegion,
} from '@/lib/dadaepo-tide';
import type { TideCurveAnchor, TideForecastEvent, TideForecastPayload } from '@/lib/tide-forecast';
import { interpolateTideCurve } from '@/lib/tide-forecast';
import { getSiteSettings } from '@/utils/site-settings-service';
import { tripDateToStr } from '@/utils/trip-guide-service';

const FONT = 'var(--font-ohgo), sans-serif';
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 14,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  overflow: 'hidden',
};

/** 약함(남색) → 강함(빨강) */
const FLOW_SEGMENT_COLORS = [
  '#3D7AB5',
  '#2F6F9C',
  '#2A6B7A',
  '#C9A227',
  '#E08A1A',
  '#E86A1A',
  '#E24B4A',
  '#DC2626',
];

type Props = {
  date: string;
  tideRegionId?: string;
  onViewAll?: () => void;
  /** section: 홈 위젯(제목+카드). embedded: 모달·예약 안 카드 */
  variant?: 'section' | 'embedded';
};

function formatTideTitle(date: string): string {
  const today = tripDateToStr();
  if (date === today) return '오늘의 물때';
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${month}월 ${day}일 물때`;
}

function formatDateLine(date: string): string {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const weekday = DAY_LABELS[new Date(`${date}T12:00:00`).getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

function TideFlowBar({ level }: { level: number }) {
  const pct = Math.max(0, Math.min(100, (level / 8) * 100));
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        height: 14,
        borderRadius: 99,
        overflow: 'hidden',
        background: `linear-gradient(90deg, ${FLOW_SEGMENT_COLORS.join(', ')})`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${pct}%`,
          right: 0,
          backgroundColor: '#E8EAED',
        }}
      />
    </div>
  );
}

function TideChart({
  date,
  events,
  anchors,
}: {
  date: string;
  events: TideForecastEvent[];
  anchors: TideCurveAnchor[];
}) {
  const dayStart = Date.parse(`${date}T00:00:00`);
  const dayEnd = dayStart + 86_400_000;
  const viewStart = dayStart - 3 * 3_600_000;
  const viewEnd = dayStart + 27 * 3_600_000;
  const viewSpan = viewEnd - viewStart;
  const width = 360;
  const height = 188;
  const pad = { l: 6, r: 8, t: 22, b: 20 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const source = anchors.length > 0 ? anchors : events.map((event) => ({
    at: event.at,
    heightCm: event.heightCm,
    type: event.type,
  }));
  const heights = source.map((item) => item.heightCm);
  if (heights.length === 0) return null;

  const minH = Math.min(...heights) - 4;
  const maxH = Math.max(...heights) + 4;
  const range = Math.max(1, maxH - minH);
  const xOf = (at: number) => pad.l + ((at - viewStart) / viewSpan) * innerW;
  const yOf = (cm: number) => pad.t + (1 - (cm - minH) / range) * innerH;

  const curve = interpolateTideCurve(source);
  const heightAt = (at: number): number | null => {
    if (curve.length === 0) return null;
    if (at <= curve[0].at) return curve[0].heightCm;
    const lastPoint = curve[curve.length - 1];
    if (at >= lastPoint.at) return lastPoint.heightCm;
    for (let i = 1; i < curve.length; i += 1) {
      const next = curve[i];
      const prev = curve[i - 1];
      if (next.at < at) continue;
      const span = next.at - prev.at;
      if (span <= 0) return next.heightCm;
      const u = (at - prev.at) / span;
      return prev.heightCm + (next.heightCm - prev.heightCm) * u;
    }
    return lastPoint.heightCm;
  };
  const startH = heightAt(viewStart);
  const endH = heightAt(viewEnd);
  const dayCurve = curve.filter((point) => point.at > viewStart && point.at < viewEnd);
  const points = [
    startH != null ? { x: pad.l, y: yOf(startH) } : null,
    ...dayCurve.map((point) => ({ x: xOf(point.at), y: yOf(point.heightCm) })),
    endH != null ? { x: pad.l + innerW, y: yOf(endH) } : null,
  ].filter((point): point is { x: number; y: number } => point != null);
  if (points.length < 2) return null;

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${(pad.t + innerH).toFixed(1)} L${points[0].x.toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`;
  const now = Date.now();
  const showNow = now >= dayStart && now < dayEnd;
  const nowX = xOf(now);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="188"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${date} 조위 그래프`}
    >
      <defs>
        <linearGradient id={`tide-fill-${date}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1B6FF5" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1B6FF5" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 6, 12, 18, 24].map((hour) => {
        const x = xOf(dayStart + hour * 3_600_000);
        return (
          <g key={hour}>
            {hour > 0 && hour < 24 ? (
              <line x1={x} y1={pad.t} x2={x} y2={pad.t + innerH} stroke="#EEF1F4" strokeWidth="1" />
            ) : null}
            <text
              x={x}
              y={height - 3}
              textAnchor="middle"
              fill="#9A9FA5"
              fontSize="10"
              fontFamily={FONT}
            >
              {String(hour).padStart(2, '0')}시
            </text>
          </g>
        );
      })}
      <path d={area} fill={`url(#tide-fill-${date})`} />
      <path d={line} fill="none" stroke="#1B6FF5" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {showNow ? (
        <line
          x1={nowX}
          y1={pad.t}
          x2={nowX}
          y2={pad.t + innerH}
          stroke="#E65100"
          strokeWidth="1.2"
          strokeDasharray="3 3"
        />
      ) : null}
      {events.map((event) => {
        const isHigh = event.type === 'high';
        const x = xOf(event.at);
        const y = yOf(event.heightCm);
        if (x < pad.l - 4 || x > width - pad.r + 4) return null;
        const accent = isHigh ? '#DC2626' : '#0F4C81';
        const fill = isHigh ? '#FEECEC' : '#E8F0FE';
        const cmLabel = `${isHigh ? '↑' : '↓'}${event.heightCm}cm`;
        const badgeW = event.heightCm >= 100 ? 50 : 46;
        const badgeH = 16;
        const timeW = 34;
        const groupW = timeW + 4 + badgeW;
        const leader = isHigh ? 12 : 40;
        let gx = x - groupW / 2;
        let gy = y - leader - badgeH;
        if (gy < 2) gy = 2;
        gx = Math.min(Math.max(pad.l, gx), width - pad.r - groupW);
        const bx = gx + timeW + 4;
        return (
          <g key={`${event.type}-${event.at}`}>
            <line
              x1={x}
              y1={gy + badgeH}
              x2={x}
              y2={y - 6}
              stroke={accent}
              strokeWidth="1"
            />
            <circle cx={x} cy={y} r="4.5" fill="#FFFFFF" stroke={accent} strokeWidth="2" />
            <text
              x={gx + timeW}
              y={gy + 11.5}
              textAnchor="end"
              fill="#6F767E"
              fontSize="9"
              fontWeight="700"
              fontFamily={FONT}
            >
              {event.time}
            </text>
            <rect x={bx} y={gy} width={badgeW} height={badgeH} rx={8} fill={fill} />
            <text
              x={bx + badgeW / 2}
              y={gy + 11.5}
              textAnchor="middle"
              fill={accent}
              fontSize="9"
              fontWeight="800"
              fontFamily={FONT}
            >
              {cmLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TripTidePanel({
  date,
  tideRegionId,
  onViewAll,
  variant = 'section',
}: Props) {
  const tideLabel = getTideLabel(date);
  const flowLevel = getTideFlowLevel(tideLabel);
  const [region, setRegion] = useState<TideRegion>(() => getTideRegion(tideRegionId));
  const [events, setEvents] = useState<TideForecastEvent[]>([]);
  const [anchors, setAnchors] = useState<TideCurveAnchor[]>([]);
  const [stationLabel, setStationLabel] = useState(region.stationLabel);

  useEffect(() => {
    if (tideRegionId) {
      setRegion(getTideRegion(tideRegionId));
      return;
    }
    let cancelled = false;
    void getSiteSettings()
      .then((settings) => {
        if (!cancelled) setRegion(getTideRegion(settings.tideRegionId));
      })
      .catch(() => {
        if (!cancelled) setRegion(getTideRegion());
      });
    return () => {
      cancelled = true;
    };
  }, [tideRegionId]);

  useEffect(() => {
    let cancelled = false;
    setEvents([]);
    setAnchors([]);
    const params = new URLSearchParams({ date, region: region.id });
    void fetch(`/api/tide?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TideForecastPayload | null) => {
        if (cancelled || !data?.ok) return;
        setEvents(data.events);
        setAnchors(data.anchors ?? []);
        if (data.region?.stationLabel) setStationLabel(data.region.stationLabel);
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setAnchors([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, region.id]);

  if (!tideLabel && events.length === 0) return null;

  const title = formatTideTitle(date);
  const card = (
    <div style={variant === 'embedded' ? { ...CARD, boxShadow: 'none', border: '1px solid #EFEFEF' } : CARD}>
      <div
        className="d-flex align-items-end justify-content-between gap-3"
        style={{ padding: '16px 16px 14px' }}
      >
        <div className="min-w-0">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: FONT }}>
            {region.label}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#9A9FA5', fontFamily: FONT, marginTop: 2 }}>
            {formatDateLine(date)}
          </div>
        </div>
        {tideLabel ? (
          <span
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: getTideTextColor(tideLabel),
              fontFamily: FONT,
              lineHeight: 1,
              letterSpacing: -0.6,
              flexShrink: 0,
            }}
          >
            {tideLabel}
          </span>
        ) : null}
      </div>

      {flowLevel > 0 ? (
        <div style={{ padding: '0 16px 4px' }}>
          <div
            className="d-flex align-items-center justify-content-between"
            style={{ marginBottom: 8 }}
          >
            <span style={{ fontSize: 12, fontWeight: 800, color: '#6F767E', fontFamily: FONT }}>
              물흐름
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: FLOW_SEGMENT_COLORS[Math.max(0, flowLevel - 1)],
                fontFamily: FONT,
              }}
            >
              {Math.round((flowLevel / 8) * 100)}%
            </span>
          </div>
          <TideFlowBar level={flowLevel} />
        </div>
      ) : null}

      {events.length > 0 || anchors.length > 0 ? (
        <div>
          <TideChart date={date} events={events} anchors={anchors} />
        </div>
      ) : null}

      <div
        style={{
          padding: '10px 16px 12px',
          borderTop: '1px solid #F2F3F5',
          fontSize: 11,
          color: '#9A9FA5',
          fontFamily: FONT,
        }}
      >
        조위 국립해양조사원
        {stationLabel ? ` · 기준 ${stationLabel}` : ''}
      </div>
    </div>
  );

  if (variant === 'embedded') {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT, marginBottom: 8 }}>
          {title}
        </div>
        {card}
      </div>
    );
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>
          {title}
        </span>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="btn p-0 d-flex align-items-center gap-1 flex-shrink-0"
            style={{
              border: 'none',
              background: 'none',
              color: '#1B6FF5',
              fontSize: 13,
              fontFamily: FONT,
              fontWeight: 600,
            }}
          >
            더보기 <IoChevronForwardOutline size={14} />
          </button>
        ) : null}
      </div>
      {card}
    </section>
  );
}
