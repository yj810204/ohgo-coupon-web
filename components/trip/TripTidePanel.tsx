'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { IoChevronForwardOutline } from 'react-icons/io5';
import {
  getTideLabel,
  getTideRegion,
  getTideTextColor,
  type TideRegion,
} from '@/lib/dadaepo-tide';
import type { TideCurveAnchor, TideForecastEvent, TideForecastPayload } from '@/lib/tide-forecast';
import { interpolateTideCurve, kstDateTimeMs, slackWindows } from '@/lib/tide-forecast';
import { estimateDayTideFlow, tideFlowFeel } from '@/lib/tide-fish-recommend';
import { getSiteSettings } from '@/utils/site-settings-service';
import { tripDateToStr } from '@/utils/trip-guide-service';
import DayAxisScroller from '@/components/trip/DayAxisScroller';

const FONT = 'var(--font-ohgo), sans-serif';

function SectionPictogram({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}
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
  showViewAll?: boolean;
  /** 그래프를 좌우로 밀면 가운데 날짜를 올린다. */
  onActiveDate?: (date: string) => void;
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

const BOAT_START_HOUR = 4;
const BOAT_END_HOUR = 18;

type TideHeaderStats = {
  high: string;
  low: string;
  range: string;
  flowLevel: number;
  flowText: string;
};

function headerStatsFrom(date: string, events: TideForecastEvent[], anchors: TideCurveAnchor[]): TideHeaderStats {
  const tideLabel = getTideLabel(date);
  const dayFlow = estimateDayTideFlow(tideLabel, events, date, anchors);
  const boatStart = kstDateTimeMs(date, BOAT_START_HOUR);
  const boatEnd = kstDateTimeMs(date, BOAT_END_HOUR);
  const headerEvents = events.filter((event) => event.at >= boatStart && event.at <= boatEnd);
  const headerHigh = [...headerEvents.filter((event) => event.type === 'high')].sort((a, b) => a.at - b.at)[0];
  const headerLow = [...headerEvents.filter((event) => event.type === 'low')].sort((a, b) => a.at - b.at)[0];
  return {
    high: headerHigh ? `만조 ${headerHigh.time}` : '',
    low: headerLow ? `간조 ${headerLow.time}` : '',
    range: dayFlow.rangeCm != null ? `고저 ${dayFlow.rangeCm}cm` : '',
    flowLevel: dayFlow.level,
    flowText: tideFlowFeel(dayFlow.peakKn),
  };
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
  const viewStart = kstDateTimeMs(date, BOAT_START_HOUR);
  const viewEnd = kstDateTimeMs(date, BOAT_END_HOUR);
  const viewSpan = viewEnd - viewStart;
  const width = 360;
  const height = 192;
  const pad = { l: 0, r: 0, t: 20, b: 22 };
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
  const showNow = now >= viewStart && now <= viewEnd;
  const nowX = xOf(now);
  const nowH = heightAt(now);
  const nowLabelW = 24;
  const nowLabelH = 16;
  const nowLabelX = Math.min(Math.max(nowX - nowLabelW / 2, 2), width - 2 - nowLabelW);
  const nowLabelY = 2;
  const windows = slackWindows(events, viewStart, viewEnd);
  const boatEvents = events.filter((event) => event.at >= viewStart && event.at <= viewEnd);
  const hourMarks = [4, 8, 12, 16, 18];

  return (
    <div>
      <div style={{ padding: '2px 16px 8px' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${date} 출조 시간 조위`}
        style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${width} / ${height}` }}
      >
        <defs>
          <linearGradient id={`tide-fill-${date}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1B6FF5" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#1B6FF5" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {windows.map((slack) => {
          const x = xOf(slack.clipFrom);
          const w = Math.max(2, xOf(slack.clipTo) - x);
          return (
            <g key={`slack-${slack.event.at}`}>
              <rect x={x} y={pad.t} width={w} height={innerH} fill="#D8F3E4" />
              {w >= 28 ? (
                <text
                  x={x + w / 2}
                  y={pad.t + 11}
                  textAnchor="middle"
                  fill="#1B7A4A"
                  fontSize="9"
                  fontWeight="800"
                  fontFamily={FONT}
                >
                  물돌이
                </text>
              ) : null}
            </g>
          );
        })}
        {hourMarks.map((hour) => {
          const x = xOf(kstDateTimeMs(date, hour));
          return (
            <text
              key={hour}
              x={x}
              y={height - 4}
              textAnchor={hour === BOAT_START_HOUR ? 'start' : hour === BOAT_END_HOUR ? 'end' : 'middle'}
              fill="#9A9FA5"
              fontSize="10"
              fontFamily={FONT}
            >
              {hour}시
            </text>
          );
        })}
        <path d={area} fill={`url(#tide-fill-${date})`} />
        <path d={line} fill="none" stroke="#1B6FF5" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {showNow ? (
          <g>
            <line
              x1={nowX}
              y1={nowLabelY + nowLabelH}
              x2={nowX}
              y2={pad.t + innerH}
              stroke="#E65100"
              strokeWidth="1.4"
              strokeDasharray="3 3"
            />
            {nowH != null ? (
              <circle cx={nowX} cy={yOf(nowH)} r="3" fill="#E65100" />
            ) : null}
          </g>
        ) : null}
        {boatEvents.map((event) => {
          const isHigh = event.type === 'high';
          const x = xOf(event.at);
          const y = yOf(event.heightCm);
          const accent = isHigh ? '#DC2626' : '#0F4C81';
          const cmLabel = `${isHigh ? '↑' : '↓'}${event.heightCm}cm`;
          const badgeW = event.heightCm >= 100 ? 84 : 78;
          const badgeH = 16;
          let gx = x - badgeW / 2;
          let gy = isHigh ? y + 10 : y - 36 - badgeH;
          if (isHigh) {
            gy = Math.min(gy, height - pad.b - badgeH);
          } else if (gy < pad.t + 1) {
            gy = pad.t + 1;
          }
          gx = Math.min(Math.max(2, gx), width - 2 - badgeW);
          const lineY1 = isHigh ? y + 5 : gy + badgeH;
          const lineY2 = isHigh ? gy : y - 5;
          return (
            <g key={`${event.type}-${event.at}`}>
              <line x1={x} y1={lineY1} x2={x} y2={lineY2} stroke={accent} strokeWidth="1" />
              <circle cx={x} cy={y} r="3.5" fill="#FFFFFF" stroke={accent} strokeWidth="2" />
              <rect x={gx} y={gy} width={badgeW} height={badgeH} rx={8} fill="#FFFFFF" />
              <text
                x={gx + 8}
                y={gy + 11.5}
                fill="#6F767E"
                fontSize="9"
                fontWeight="700"
                fontFamily={FONT}
              >
                {event.time}
              </text>
              <text
                x={gx + badgeW - 8}
                y={gy + 11.5}
                textAnchor="end"
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
        {showNow ? (
          <g>
            <rect x={nowLabelX} y={nowLabelY} width={nowLabelW} height={nowLabelH} rx={8} fill="#FFFFFF" />
            <text
              x={nowLabelX + nowLabelW / 2}
              y={nowLabelY + 11.5}
              textAnchor="middle"
              fill="#E65100"
              fontSize="9"
              fontWeight="800"
              fontFamily={FONT}
            >
              지금
            </text>
          </g>
        ) : null}
      </svg>
      </div>
    </div>
  );
}

function TideDayChart({ date, regionId }: { date: string; regionId: string }) {
  const [events, setEvents] = useState<TideForecastEvent[]>([]);
  const [anchors, setAnchors] = useState<TideCurveAnchor[]>([]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ date, region: regionId });
    void fetch(`/api/tide?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TideForecastPayload | null) => {
        if (cancelled || !data?.ok) return;
        setEvents(data.events);
        setAnchors(data.anchors ?? []);
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
  }, [date, regionId]);

  if (events.length === 0 && anchors.length === 0) {
    return <div style={{ minHeight: 180 }} />;
  }
  return <TideChart date={date} events={events} anchors={anchors} />;
}

export default function TripTidePanel({
  date,
  tideRegionId,
  onViewAll,
  showViewAll,
  onActiveDate,
  variant = 'section',
}: Props) {
  const tideLabel = getTideLabel(date);
  const [region, setRegion] = useState<TideRegion>(() => getTideRegion(tideRegionId));
  const [events, setEvents] = useState<TideForecastEvent[]>([]);
  const [anchors, setAnchors] = useState<TideCurveAnchor[]>([]);
  const [stationLabel, setStationLabel] = useState(region.stationLabel);
  const [headerStats, setHeaderStats] = useState<TideHeaderStats | null>(null);

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
    const params = new URLSearchParams({ date, region: region.id });
    void fetch(`/api/tide?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TideForecastPayload | null) => {
        if (cancelled || !data?.ok) return;
        setEvents(data.events);
        setAnchors(data.anchors ?? []);
        setHeaderStats(headerStatsFrom(date, data.events, data.anchors ?? []));
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

  if (!tideLabel && events.length === 0 && !headerStats) return null;

  const flowLevel = headerStats?.flowLevel ?? 0;
  const title = formatTideTitle(date);
  const card = (
    <div style={variant === 'embedded' ? { ...CARD, boxShadow: 'none', border: '1px solid #EFEFEF' } : CARD}>
      <div
        className="d-flex align-items-center justify-content-between gap-2"
        style={{ padding: '8px 16px' }}
      >
        <div className="min-w-0">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: FONT }}>
            {region.label}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#9A9FA5', fontFamily: FONT, marginTop: 2 }}>
            {formatDateLine(date)}
          </div>
        </div>
        <div className="min-w-0" style={{ flex: '1 1 auto', textAlign: 'center', fontFamily: FONT }}>
          <div style={{ height: 15, fontSize: 11, fontWeight: 800, color: '#DC2626', lineHeight: '15px' }}>
            {headerStats?.high || '\u00a0'}
          </div>
          <div style={{ height: 15, fontSize: 11, fontWeight: 800, color: '#0F4C81', lineHeight: '15px' }}>
            {headerStats?.low || '\u00a0'}
          </div>
          <div style={{ height: 15, marginTop: 1, fontSize: 11, fontWeight: 700, color: '#9A9FA5', lineHeight: '15px' }}>
            {headerStats?.range || '\u00a0'}
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
        <div style={{ padding: '0 16px 0' }}>
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
              {headerStats?.flowText ?? ''}
            </span>
          </div>
          <TideFlowBar level={flowLevel} />
        </div>
      ) : null}

      {onActiveDate ? (
        <DayAxisScroller date={date} onDateChange={onActiveDate}>
          {(day) => <TideDayChart date={day} regionId={region.id} />}
        </DayAxisScroller>
      ) : events.length > 0 || anchors.length > 0 ? (
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
        <div className="d-flex align-items-center gap-2" style={{ marginBottom: 8 }}>
          <SectionPictogram>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#F5A524"
                transform="translate(6.4 -0.4) scale(0.5)"
                d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162z"
              />
              <path
                d="M2 16.6c1.3-1.6 2.7-1.6 4 0s2.7 1.6 4 0 2.7-1.6 4 0 2.7 1.6 4 0 2.7-1.6 4 0"
                fill="none"
                stroke="#1B6FF5"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M2 20.4c1.3-1.6 2.7-1.6 4 0s2.7 1.6 4 0 2.7-1.6 4 0 2.7 1.6 4 0 2.7-1.6 4 0"
                fill="none"
                stroke="#8EBAF0"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </SectionPictogram>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>{title}</div>
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
        {onViewAll || showViewAll ? (
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
