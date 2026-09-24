'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  isWindWeatherPayload,
  weatherCodeText,
  type WindHourPoint,
  type WindWeatherPayload,
} from '@/lib/open-meteo-wind';
import { OHGO_CARD, OHGO_FONT } from '@/lib/page-styles';
import DayAxisScroller from '@/components/trip/DayAxisScroller';

const FONT = OHGO_FONT;
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const WIND_SLOTS = [6, 9, 12, 15, 18] as const;

type WeatherKind = 'clear' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' | 'none';

function formatDateLine(date: string): string {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const weekday = DAY_LABELS[new Date(`${date}T12:00:00`).getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

function weatherKind(text: string): WeatherKind {
  if (!text) return 'none';
  if (text.includes('뇌우')) return 'storm';
  if (text.includes('눈')) return 'snow';
  if (text.includes('비') || text.includes('소나기')) return 'rain';
  if (text.includes('안개')) return 'fog';
  if (text.includes('흐림')) return 'cloud';
  if (text.includes('구름')) return 'partly';
  if (text.includes('맑음')) return 'clear';
  return 'cloud';
}

const WIND_BAR_STOPS: Array<{ ms: number; color: string }> = [
  { ms: 0, color: '#F8FAFC' },
  { ms: 3, color: '#F4F8FC' },
  { ms: 4, color: '#9ED4F2' },
  { ms: 5, color: '#6FCBB8' },
  { ms: 6, color: '#8ED45A' },
  { ms: 7, color: '#C6D84A' },
  { ms: 8, color: '#E4C84A' },
  { ms: 9, color: '#F0A85A' },
  { ms: 10, color: '#F08A4A' },
  { ms: 11, color: '#E86A4A' },
  { ms: 12, color: '#D84E48' },
];

function windBarColor(ms: number): string {
  const value = Math.max(0, ms);
  const nextIndex = WIND_BAR_STOPS.findIndex((stop) => stop.ms >= value);
  const next = WIND_BAR_STOPS[nextIndex === -1 ? WIND_BAR_STOPS.length - 1 : nextIndex];
  const prev = WIND_BAR_STOPS[Math.max(0, (nextIndex === -1 ? WIND_BAR_STOPS.length - 1 : nextIndex) - 1)];
  const span = next.ms - prev.ms;
  const ratio = span <= 0 ? 1 : Math.min(1, (value - prev.ms) / span);
  const mix = (from: string, to: string) => {
    const parse = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
    const [r1, g1, b1] = parse(from);
    const [r2, g2, b2] = parse(to);
    const channel = (start: number, end: number) => Math.round(start + (end - start) * ratio);
    return `rgb(${channel(r1, r2)},${channel(g1, g2)},${channel(b1, b2)})`;
  };
  return mix(prev.color, next.color);
}

function barGradient(values: Array<number | null>): string {
  const colors = values.map((value) => (value == null ? '#F4F7FB' : windBarColor(value)));
  if (colors.length < 2) return colors[0] ?? '#F4F7FB';
  const stops = colors.map((color, index) => `${color} ${((index / (colors.length - 1)) * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function barNumber(value: number | null): string {
  return value == null ? '–' : String(Math.round(value));
}


function kstNow(): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '0';
  const hour = Number(pick('hour'));
  const minute = Number(pick('minute'));
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    hour: (Number.isFinite(hour) ? hour % 24 : 0) + (Number.isFinite(minute) ? minute : 0) / 60,
  };
}

function WindArrow({ fromDeg }: { fromDeg: number | null }) {
  const blow = fromDeg == null ? 0 : (fromDeg + 180) % 360;
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden
      style={{ transform: `rotate(${blow}deg)`, opacity: fromDeg == null ? 0.35 : 1 }}
    >
      <path d="M12 3.5 17.2 12h-3.1v8.2h-4.2V12H6.8z" fill="#5E6E86" />
    </svg>
  );
}

function nowMarkerLeft(hour: number): string {
  const start = WIND_SLOTS[0];
  const end = WIND_SLOTS[WIND_SLOTS.length - 1];
  const span = end - start;
  const ratio = span <= 0 ? 0 : Math.min(1, Math.max(0, (hour - start) / span));
  const inset = 0.5 / WIND_SLOTS.length;
  const travel = (WIND_SLOTS.length - 1) / WIND_SLOTS.length;
  return `${((inset + ratio * travel) * 100).toFixed(2)}%`;
}

function WindStrip({ date, hours }: { date: string; hours: WindHourPoint[] }) {
  const now = kstNow();
  const stripRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const slots = WIND_SLOTS.map((hour) => hours.find((point) => point.hour === hour) ?? null);
  const showNow = now.date === date && now.hour >= WIND_SLOTS[0] && now.hour <= WIND_SLOTS[WIND_SLOTS.length - 1];
  const nowLeft = showNow ? nowMarkerLeft(now.hour) : '0%';
  const [dotTop, setDotTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const speed = speedRef.current;
    if (!strip || !speed || !showNow) return;
    const stripBox = strip.getBoundingClientRect();
    const speedBox = speed.getBoundingClientRect();
    setDotTop(speedBox.top - stripBox.top + speedBox.height / 2);
  }, [showNow, date, hours]);

  if (slots.every((slot) => slot == null)) return null;

  return (
    <div
      ref={stripRef}
      role="img"
      aria-label={`${date} 바람. 위 숫자는 평균 풍속, 아래 숫자는 돌풍, 화살표는 바람이 불어가는 방향`}
      style={{ marginTop: 8, position: 'relative', paddingTop: showNow ? 18 : 0 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${WIND_SLOTS.length}, 1fr)`, position: 'relative' }}>
        {slots.map((slot, index) => {
          const hour = WIND_SLOTS[index];
          const kind = weatherKind(slot?.weatherCode == null ? '' : weatherCodeText(slot.weatherCode));
          return (
            <div key={hour} style={{ textAlign: 'center', opacity: slot ? 1 : 0.4 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8A9199',
                  fontFamily: FONT,
                  lineHeight: '14px',
                }}
              >
                {hour}시
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 8px' }}>
                <WeatherMark kind={kind} size={28} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'relative' }}>
        {(['speed', 'gust'] as const).map((field) => (
          <Fragment key={field}>
            {field === 'gust' ? <div aria-hidden style={{ height: 1, background: '#FFFFFF' }} /> : null}
            <div
              ref={field === 'speed' ? speedRef : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${WIND_SLOTS.length}, 1fr)`,
                background: barGradient(slots.map((slot) => slot?.[field] ?? null)),
                height: field === 'gust' ? 16 : 26,
                borderRadius: field === 'speed' ? '8px 8px 0 0' : '0 0 8px 8px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {slots.map((slot, index) => (
                <div
                  key={WIND_SLOTS[index]}
                  style={{
                    color: '#1A1D1F',
                    textAlign: 'center',
                    fontSize: field === 'gust' ? 10 : 14,
                    fontWeight: field === 'gust' ? 400 : 800,
                    fontFamily: FONT,
                    lineHeight: field === 'gust' ? '16px' : '26px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {barNumber(slot?.[field] ?? null)}
                </div>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${WIND_SLOTS.length}, 1fr)`,
          marginTop: 6,
          position: 'relative',
        }}
      >
        {slots.map((slot, index) => (
          <div key={WIND_SLOTS[index]} style={{ display: 'flex', justifyContent: 'center' }}>
            <WindArrow fromDeg={slot?.dirDeg ?? null} />
          </div>
        ))}
      </div>
      {showNow ? (
        <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              left: nowLeft,
              top: 1,
              transform: 'translateX(-50%)',
              width: 24,
              height: 16,
              borderRadius: 8,
              background: '#FFFFFF',
              color: '#E65100',
              fontSize: 9,
              fontWeight: 800,
              fontFamily: FONT,
              lineHeight: '16px',
              textAlign: 'center',
            }}
          >
            지금
          </div>
          <div
            style={{
              position: 'absolute',
              left: nowLeft,
              top: 16,
              bottom: 0,
              width: 1.4,
              marginLeft: -0.7,
              backgroundImage: 'repeating-linear-gradient(to bottom, #E65100 0 3px, transparent 3px 6px)',
            }}
          />
          {dotTop != null ? (
            <div
              style={{
                position: 'absolute',
                left: nowLeft,
                top: dotTop,
                width: 6,
                height: 6,
                marginLeft: -3,
                marginTop: -3,
                borderRadius: '50%',
                background: '#E65100',
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CardShell({
  children,
  spaced = true,
  bordered = false,
}: {
  children: ReactNode;
  spaced?: boolean;
  bordered?: boolean;
}) {
  return (
    <div
      className={spaced ? 'mt-3' : undefined}
      style={{
        ...OHGO_CARD,
        padding: 16,
        ...(bordered
          ? { boxShadow: 'none', border: '1px solid #EFEFEF', borderRadius: 14 }
          : {}),
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ date }: { date: string }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <div className="d-flex align-items-center gap-2 min-w-0">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: '#F4F7FB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M3 8.5h11.2a2.6 2.6 0 1 0-2.4-3.6"
              fill="none"
              stroke="#3D7AB5"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <path
              d="M3 12.2h15.4a2.8 2.8 0 1 1-2.5 4.1"
              fill="none"
              stroke="#1B6FF5"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <path
              d="M3 16h8.2a2.2 2.2 0 1 1-1.8 3.4"
              fill="none"
              stroke="#8AA0B8"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>바람</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9A9FA5', fontFamily: FONT, marginTop: 1 }}>
            {formatDateLine(date)}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeatherMark({ kind, size = 22 }: { kind: WeatherKind; size?: number }) {
  const sun = (
    <g>
      <circle cx="12" cy="12" r="4" fill="#F5A524" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="12"
          y1="4.2"
          x2="12"
          y2="6.1"
          stroke="#F5A524"
          strokeWidth="1.4"
          strokeLinecap="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </g>
  );
  const cloud = (
    <path
      d="M7.2 17.6h9.4a3.7 3.7 0 0 0 .4-7.3 4.7 4.7 0 0 0-8.9-1.1 3.2 3.2 0 0 0-.9 8.4z"
      fill="#C5CED6"
    />
  );

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {kind === 'clear' ? sun : null}
      {kind === 'partly' ? (
        <g>
          <g transform="translate(-1.5 -2) scale(0.72)">{sun}</g>
          {cloud}
        </g>
      ) : null}
      {kind === 'cloud' || kind === 'none' ? <g transform="translate(0 1)">{cloud}</g> : null}
      {kind === 'fog' ? (
        <g stroke="#C5CED6" strokeWidth="1.8" strokeLinecap="round">
          <path d="M7 9.5h10" />
          <path d="M5.5 12.5h13" />
          <path d="M7 15.5h10" />
        </g>
      ) : null}
      {kind === 'rain' ? (
        <g>
          <g transform="translate(0 -2)">{cloud}</g>
          <g stroke="#3D7AB5" strokeWidth="1.4" strokeLinecap="round">
            <path d="M9 15.2l-1 2.6" />
            <path d="M12.2 15.2l-1 2.6" />
            <path d="M15.4 15.2l-1 2.6" />
          </g>
        </g>
      ) : null}
      {kind === 'snow' ? (
        <g stroke="#3D7AB5" strokeWidth="1.6" strokeLinecap="round">
          <path d="M12 5v14" />
          <path d="M6 8.2l12 7.6" />
          <path d="M6 15.8l12-7.6" />
          <path d="M12 8.2l-1.6-1.2M12 8.2l1.6-1.2" />
          <path d="M12 15.8l-1.6 1.2M12 15.8l1.6 1.2" />
        </g>
      ) : null}
      {kind === 'storm' ? (
        <g>
          <g transform="translate(0 -3)">{cloud}</g>
          <path d="M13 12.2l-2.4 4.2h2.2L11.2 21l4.2-5.4h-2.2z" fill="#E08A1A" />
        </g>
      ) : null}
    </svg>
  );
}

function WeatherLine({ payload }: { payload: WindWeatherPayload }) {
  const bits: string[] = [];
  if (payload.weatherText) bits.push(payload.weatherText);
  if (payload.precipMmSum != null) {
    bits.push(payload.precipMmSum > 0 ? `강수 ${payload.precipMmSum.toFixed(1)} mm` : '강수 없음');
  }
  if (bits.length === 0) return null;
  const kind = weatherKind(payload.weatherText);
  return (
    <div
      className="d-flex align-items-center gap-2"
      style={{
        marginTop: 10,
        padding: '8px 10px',
        borderRadius: 12,
        backgroundColor: '#F7F8FA',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <WeatherMark kind={kind} />
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#1A1D1F',
          fontFamily: FONT,
          wordBreak: 'keep-all',
        }}
      >
        {bits.join(' · ')}
      </div>
    </div>
  );
}

function Attribution() {
  return (
    <div
      style={{
        marginTop: 10,
        fontSize: 10,
        color: '#B0B6BD',
        fontFamily: FONT,
        lineHeight: 1.45,
      }}
    >
      <a
        href="https://open-meteo.com/"
        target="_blank"
        rel="noreferrer"
        style={{ color: '#B0B6BD', textDecoration: 'underline' }}
      >
        Open-Meteo
      </a>
      {' · ECMWF IFS'}
    </div>
  );
}

function WindDayPane({ date }: { date: string }) {
  const [hours, setHours] = useState<WindHourPoint[] | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setHours(null);
    setNotice('');
    void fetch(`/api/weather?date=${encodeURIComponent(date)}`)
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (cancelled) return;
        if (isWindWeatherPayload(data)) {
          setHours(data.hours ?? []);
          return;
        }
        const error =
          data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : '';
        setNotice(error.includes('없습니다') ? '예보 없음' : '불러오지 못함');
        setHours([]);
      })
      .catch(() => {
        if (!cancelled) {
          setNotice('불러오지 못함');
          setHours([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (hours == null) return <div style={{ minHeight: 148 }} />;
  if (notice) {
    return (
      <div
        style={{
          minHeight: 148,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 600,
          color: '#6F767E',
          fontFamily: FONT,
        }}
      >
        {notice}
      </div>
    );
  }
  return <WindStrip date={date} hours={hours} />;
}

export default function WindWeatherCard({
  date,
  onActiveDate,
  spaced = true,
  bordered = false,
}: {
  date: string;
  onActiveDate?: (date: string) => void;
  /** 섹션 제목 바로 아래에서는 카드 위 여백을 두지 않는다. */
  spaced?: boolean;
  /** 모달 안에서는 그림자가 아니라 물때 카드와 같은 테두리를 쓴다. */
  bordered?: boolean;
}) {
  const [payload, setPayload] = useState<WindWeatherPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('이 날짜의 바람 예보가 없습니다.');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/weather?date=${encodeURIComponent(date)}`)
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (cancelled) return;
        if (isWindWeatherPayload(data)) {
          setPayload(data);
          setFailed(false);
        } else {
          const error =
            data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
              ? (data as { error: string }).error
              : '';
          setNotice(error.includes('없습니다') ? '이 날짜의 바람 예보가 없습니다.' : '바람 예보를 불러오지 못했습니다.');
          setFailed(true);
          setPayload(null);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setNotice('바람 예보를 불러오지 못했습니다.');
          setFailed(true);
          setPayload(null);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (!loaded && !onActiveDate) {
    return (
      <CardShell spaced={spaced} bordered={bordered}>
        <CardHeader date={date} />
        <div style={{ fontSize: 13, fontWeight: 600, color: '#9A9FA5', fontFamily: FONT, marginTop: 12 }}>
          예보 불러오는 중…
        </div>
      </CardShell>
    );
  }

  if (!onActiveDate && (failed || !payload)) {
    return (
      <CardShell spaced={spaced} bordered={bordered}>
        <CardHeader date={date} />
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#6F767E',
            fontFamily: FONT,
            marginTop: 12,
            lineHeight: 1.5,
            wordBreak: 'keep-all',
          }}
        >
          {notice}
        </div>
        <Attribution />
      </CardShell>
    );
  }

  return (
    <CardShell spaced={spaced} bordered={bordered}>
      <CardHeader date={date} />
      <div style={{ marginTop: 4 }}>
        {onActiveDate ? (
          <DayAxisScroller date={date} onDateChange={onActiveDate}>
            {(day) => <WindDayPane date={day} />}
          </DayAxisScroller>
        ) : (
          <WindStrip date={payload?.date ?? date} hours={payload?.hours ?? []} />
        )}
      </div>
      {payload ? <WeatherLine payload={payload} /> : null}
      <Attribution />
    </CardShell>
  );
}
