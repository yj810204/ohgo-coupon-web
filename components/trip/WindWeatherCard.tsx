'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  isWindWeatherPayload,
  type WindGrade,
  type WindWeatherPayload,
  type WindWindow,
} from '@/lib/open-meteo-wind';
import { OHGO_CARD, OHGO_FONT } from '@/lib/page-styles';

const FONT = OHGO_FONT;
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const GRADE_STYLE: Record<WindGrade, { bg: string; color: string }> = {
  양호: { bg: '#E8F6EE', color: '#1B7A4A' },
  주의: { bg: '#FFF4E0', color: '#C26A00' },
  불리: { bg: '#FFE8D6', color: '#C2410C' },
  강풍: { bg: '#FDECEC', color: '#DC2626' },
};

function formatDateLine(date: string): string {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const weekday = DAY_LABELS[new Date(`${date}T12:00:00`).getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

function formatMs(value: number | null): string {
  return value == null ? '–' : `${value.toFixed(1)} m/s`;
}

function GradeBadge({ grade }: { grade: WindGrade | null }) {
  if (!grade) {
    return (
      <span style={{ fontSize: 12, fontWeight: 700, color: '#9A9FA5', fontFamily: FONT }}>–</span>
    );
  }
  const tone = GRADE_STYLE[grade];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 40,
        padding: '2px 8px',
        borderRadius: 999,
        backgroundColor: tone.bg,
        color: tone.color,
        fontSize: 12,
        fontWeight: 800,
        fontFamily: FONT,
        lineHeight: 1.4,
      }}
    >
      {grade}
    </span>
  );
}

function WindowRow({ window }: { window: WindWindow }) {
  const detail =
    window.hourCount === 0
      ? '해당 시간대 예보 없음'
      : `${formatMs(window.avgMs)} · 돌풍 ${formatMs(window.gustMaxMs)}${
          window.dirText ? ` · ${window.dirText}` : ''
        }`;

  return (
    <div
      className="d-flex align-items-start justify-content-between gap-2"
      style={{ padding: '10px 0' }}
    >
      <div className="min-w-0">
        <div style={{ fontSize: 12, fontWeight: 800, color: '#6F767E', fontFamily: FONT }}>
          {window.label}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#1A1D1F',
            fontFamily: FONT,
            marginTop: 4,
            lineHeight: 1.45,
            wordBreak: 'keep-all',
          }}
        >
          {detail}
        </div>
      </div>
      <div className="flex-shrink-0" style={{ paddingTop: 2 }}>
        <GradeBadge grade={window.grade} />
      </div>
    </div>
  );
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3" style={{ ...OHGO_CARD, padding: 16 }}>
      {children}
    </div>
  );
}

function CardHeader({ date, right }: { date: string; right?: string }) {
  return (
    <div className="d-flex align-items-start justify-content-between gap-2">
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>
          바람 · ECMWF
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#9A9FA5', fontFamily: FONT, marginTop: 2 }}>
          {formatDateLine(date)}
        </div>
      </div>
      {right ? (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9A9FA5', fontFamily: FONT }}>{right}</div>
      ) : null}
    </div>
  );
}

function WeatherLine({ payload }: { payload: WindWeatherPayload }) {
  const bits: string[] = [];
  if (payload.weatherText) bits.push(payload.weatherText);
  if (payload.precipMmSum != null) {
    bits.push(payload.precipMmSum > 0 ? `강수 ${payload.precipMmSum.toFixed(1)} mm` : '강수 없음');
  }
  if (bits.length === 0) return null;
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: '#6F767E',
        fontFamily: FONT,
        paddingTop: 2,
        wordBreak: 'keep-all',
      }}
    >
      {bits.join(' · ')}
    </div>
  );
}

function Attribution({ payload }: { payload?: WindWeatherPayload | null }) {
  const grid = payload?.coords.grid;
  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 10,
        borderTop: '1px solid #F2F3F5',
        fontSize: 11,
        color: '#9A9FA5',
        fontFamily: FONT,
        lineHeight: 1.5,
        wordBreak: 'keep-all',
      }}
    >
      {grid ? `격자 ${grid[0].toFixed(1)}, ${grid[1].toFixed(1)} · ` : ''}
      광역 참고예보 · 모델 갱신 ~6시간
      <br />
      <a
        href="https://open-meteo.com/"
        target="_blank"
        rel="noreferrer"
        style={{ color: '#9A9FA5', textDecoration: 'underline' }}
      >
        Weather data by Open-Meteo.com
      </a>
      {' · ECMWF IFS (CC BY) · 창 평균·라벨은 가공됨'}
    </div>
  );
}

export default function WindWeatherCard({ date }: { date: string }) {
  const [payload, setPayload] = useState<WindWeatherPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setFailed(false);
    setLoaded(false);
    void fetch(`/api/weather?date=${encodeURIComponent(date)}`)
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (cancelled) return;
        if (isWindWeatherPayload(data)) setPayload(data);
        else setFailed(true);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (!loaded) {
    return (
      <CardShell>
        <CardHeader date={date} />
        <div style={{ fontSize: 13, fontWeight: 600, color: '#9A9FA5', fontFamily: FONT, marginTop: 10 }}>
          예보 불러오는 중…
        </div>
      </CardShell>
    );
  }

  if (failed || !payload) {
    return (
      <CardShell>
        <CardHeader date={date} />
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#6F767E',
            fontFamily: FONT,
            marginTop: 10,
            lineHeight: 1.5,
            wordBreak: 'keep-all',
          }}
        >
          바람 예보 일시 불가
        </div>
        <Attribution />
      </CardShell>
    );
  }

  return (
    <CardShell>
      <CardHeader date={date} right="낫개·다대포" />
      <div style={{ marginTop: 4 }}>
        {payload.windows.map((window, index) => (
          <div
            key={window.id}
            style={{ borderTop: index === 0 ? '1px solid #F2F3F5' : '1px solid #F7F8FA' }}
          >
            <WindowRow window={window} />
          </div>
        ))}
      </div>
      <WeatherLine payload={payload} />
      <Attribution payload={payload} />
    </CardShell>
  );
}
