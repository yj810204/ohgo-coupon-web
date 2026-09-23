'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import {
  IoChevronBackOutline,
  IoChevronDownOutline,
  IoChevronForwardOutline,
  IoChevronUpOutline,
} from 'react-icons/io5';
import {
  getTideLabel,
  getTideRegion,
  getTideTextColor,
  type TideRegion,
} from '@/lib/dadaepo-tide';
import {
  briefingDisplaySections,
  hasTideAiBriefingContent,
  isTideAiBriefing,
  parseBriefingMarkup,
  type BriefingMarkupNode,
  TIDE_BRIEFING_EMPTY,
  TIDE_BRIEFING_ONPAGE_FOOTER,
  TIDE_BRIEFING_TITLE,
  type TideAiBriefing,
} from '@/utils/tide-ai-briefing-shared';
import { getSiteSettings } from '@/utils/site-settings-service';
import { tripDateToStr } from '@/utils/trip-guide-service';
import { OHGO_CARD, OHGO_FONT } from '@/lib/page-styles';
import TripTidePanel from '@/components/trip/TripTidePanel';
import WindWeatherCard from '@/components/trip/WindWeatherCard';

const FONT = OHGO_FONT;
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const TODAY_ACCENT = '#E65100';
const TODAY_BG = '#FFF3E0';

function toYM(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return tripDateToStr(date);
}

function weekDateStrs(dateStr: string): string[] {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    return tripDateToStr(day);
  });
}

function formatSunSatWeekLabel(dateStr: string): string {
  const days = weekDateStrs(dateStr);
  const start = days[0];
  const end = days[6];
  const sm = Number(start.slice(5, 7));
  const sd = Number(start.slice(8, 10));
  const em = Number(end.slice(5, 7));
  const ed = Number(end.slice(8, 10));
  if (sm === em) return `${sm}월 ${sd}일 – ${ed}일`;
  return `${sm}월 ${sd}일 – ${em}월 ${ed}일`;
}

const BRIEFING_BODY_WEIGHT = 400;
const BRIEFING_EMPHASIS_WEIGHT = 600;

function renderBriefingNodes(nodes: BriefingMarkupNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === 'text') return <span key={key}>{node.text}</span>;
    if (node.type === 'br') return <br key={key} />;
    const children = renderBriefingNodes(node.children, key);
    if (node.type === 'u') {
      return (
        <u key={key} style={{ fontWeight: BRIEFING_EMPHASIS_WEIGHT, textDecoration: 'underline' }}>
          {children}
        </u>
      );
    }
    if (node.type === 'em') return <em key={key}>{children}</em>;
    return (
      <strong key={key} style={{ fontWeight: BRIEFING_EMPHASIS_WEIGHT }}>
        {children}
      </strong>
    );
  });
}

function BriefingRichText({ text }: { text: string }) {
  return <>{renderBriefingNodes(parseBriefingMarkup(text), 'b')}</>;
}

function TideBriefingCard({ briefing }: { briefing: TideAiBriefing | null }) {
  const published = briefing && hasTideAiBriefingContent(briefing) ? briefing : null;

  return (
    <div className="mt-3" style={{ ...OHGO_CARD, padding: 16 }}>
      <div className="d-flex align-items-center gap-2">
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
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path fill="#1B6FF5" d="M12 1.6 14.3 8.8 21.8 11.2 14.3 13.6 12 20.8 9.7 13.6 2.2 11.2 9.7 8.8Z" />
            <path fill="#F5A524" d="M18.5 14.4 19.6 17.6 22.8 18.7 19.6 19.8 18.5 23 17.4 19.8 14.2 18.7 17.4 17.6Z" />
          </svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>
          {TIDE_BRIEFING_TITLE}
        </div>
      </div>
      {published ? (
        briefingDisplaySections(published).map((section) => (
          <div key={section.key} style={{ marginTop: 10 }}>
            {section.key !== 'markdown' && section.label !== TIDE_BRIEFING_TITLE ? (
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6F767E', fontFamily: FONT }}>
                {section.label}
              </div>
            ) : null}
            <div
              style={{
                fontSize: 13,
                fontWeight: BRIEFING_BODY_WEIGHT,
                color: '#1A1D1F',
                fontFamily: FONT,
                marginTop: section.key === 'markdown' ? 8 : 4,
                lineHeight: section.key === 'markdown' ? 1.7 : 1.6,
                whiteSpace: 'pre-line',
                wordBreak: 'keep-all',
              }}
            >
              <BriefingRichText text={section.body} />
            </div>
          </div>
        ))
      ) : (
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#6F767E',
            fontFamily: FONT,
            marginTop: 8,
            lineHeight: 1.5,
            wordBreak: 'keep-all',
          }}
        >
          {TIDE_BRIEFING_EMPTY}
        </div>
      )}
      {published ? (
        <div
          style={{
            fontSize: 11,
            color: '#9A9FA5',
            fontFamily: FONT,
            marginTop: 12,
            lineHeight: 1.4,
            wordBreak: 'keep-all',
          }}
        >
          {TIDE_BRIEFING_ONPAGE_FOOTER}
        </div>
      ) : null}
    </div>
  );
}

export default function TideCalendarScreen({
  tideRegionId,
}: {
  tideRegionId?: string;
}) {
  const today = tripDateToStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)) - 1);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [region, setRegion] = useState<TideRegion>(() => getTideRegion(tideRegionId));
  const [briefing, setBriefing] = useState<TideAiBriefing | null>(null);
  const [briefingLoaded, setBriefingLoaded] = useState(false);

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
    setBriefing(null);
    setBriefingLoaded(false);
    void fetch(`/api/tide/briefing?date=${selectedDate}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        setBriefing(isTideAiBriefing(payload?.briefing) ? payload.briefing : null);
        setBriefingLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setBriefing(null);
          setBriefingLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weekCount = cells.length / 7;
  const weekDates = weekDateStrs(selectedDate);
  const currentMonthDate = useMemo(() => new Date(year, month, 1), [year, month]);

  const selectDate = (dateStr: string) => {
    const next = new Date(`${dateStr}T12:00:00`);
    setSelectedDate(dateStr);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  const goToDay = (delta: number) => selectDate(addDays(selectedDate, delta));
  const shiftMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    const keepDay = Math.min(Number(selectedDate.slice(8, 10)) || 1, lastDay);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelectedDate(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(keepDay).padStart(2, '0')}`,
    );
  };

  const renderDayCell = (dateStr: string, col: number, outsideMonth: boolean) => {
    const day = Number(dateStr.slice(8, 10));
    const tideLabel = getTideLabel(dateStr);
    const isToday = dateStr === today;
    const isSelected = dateStr === selectedDate;
    let dayNumberColor = '#1A1D1F';
    if (outsideMonth) dayNumberColor = '#C5C8CD';
    else if (col === 0) dayNumberColor = '#FF3B30';
    else if (col === 6) dayNumberColor = '#1B6FF5';

    let cellBg = '#FFFFFF';
    if (isSelected) cellBg = isToday ? TODAY_BG : '#EBF1FE';
    else if (isToday) cellBg = TODAY_BG;

    return (
      <button
        key={dateStr}
        type="button"
        onClick={() => selectDate(dateStr)}
        className="btn"
        style={{
          flex: '1 1 0',
          minWidth: 0,
          minHeight: 40,
          border: 'none',
          backgroundColor: cellBg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 1,
          padding: '3px 1px 2px',
          borderRadius: 0,
          opacity: outsideMonth ? 0.7 : 1,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isSelected ? (isToday ? TODAY_ACCENT : '#1B6FF5') : 'transparent',
            fontSize: 12,
            fontWeight: isSelected || isToday ? 700 : 600,
            fontFamily: FONT,
            color: isSelected ? '#FFFFFF' : dayNumberColor,
          }}
        >
          {day}
        </div>
        <div
          style={{
            height: 13,
            minHeight: 13,
            fontSize: 9,
            fontWeight: 800,
            fontFamily: FONT,
            color: tideLabel ? getTideTextColor(tideLabel, { muted: !isSelected && !isToday }) : '#C5C8CD',
            lineHeight: 1.3,
          }}
        >
          {tideLabel || ''}
        </div>
      </button>
    );
  };

  return (
    <>
      <div className="position-relative mb-2" style={{ ...OHGO_CARD, overflow: 'hidden', width: '100%', minWidth: 0 }}>
        <div className="d-flex align-items-center px-1 pt-1 pb-1">
          <button
            type="button"
            onClick={() => (calendarExpanded ? shiftMonth(-1) : goToDay(-1))}
            className="btn p-0 d-flex align-items-center justify-content-center flex-shrink-0"
            aria-label={calendarExpanded ? '이전 달' : '이전일'}
            style={{ width: 40, height: 40, border: 'none', background: 'none', color: '#1A1D1F' }}
          >
            <IoChevronBackOutline size={22} />
          </button>
          <span
            className="flex-grow-1 text-center"
            style={{ fontSize: 16, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}
          >
            {calendarExpanded
              ? format(currentMonthDate, 'yyyy년 M월')
              : formatSunSatWeekLabel(selectedDate)}
          </span>
          <button
            type="button"
            onClick={() => (calendarExpanded ? shiftMonth(1) : goToDay(1))}
            className="btn p-0 d-flex align-items-center justify-content-center flex-shrink-0"
            aria-label={calendarExpanded ? '다음 달' : '다음일'}
            style={{ width: 40, height: 40, border: 'none', background: 'none', color: '#1A1D1F' }}
          >
            <IoChevronForwardOutline size={22} />
          </button>
        </div>
        <div className="d-flex" style={{ borderTop: '1px solid #F7F8FA', borderBottom: '1px solid #F7F8FA' }}>
          {DAY_LABELS.map((label, index) => (
            <div
              key={label}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '6px 0',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: FONT,
                color: index === 0 ? '#FF3B30' : index === 6 ? '#1B6FF5' : '#6F767E',
              }}
            >
              {label}
            </div>
          ))}
        </div>
        {calendarExpanded
          ? Array.from({ length: weekCount }, (_, row) => (
              <div
                key={row}
                className="d-flex"
                style={{ borderBottom: row < weekCount - 1 ? '1px solid #F7F8FA' : 'none' }}
              >
                {cells.slice(row * 7, row * 7 + 7).map((day, col) =>
                  day ? (
                    renderDayCell(`${toYM(year, month)}-${String(day).padStart(2, '0')}`, col, false)
                  ) : (
                    <div key={`empty-${col}`} style={{ flex: 1, minHeight: 40, padding: '2px 1px' }} aria-hidden />
                  ),
                )}
              </div>
            ))
          : (
            <div className="d-flex">
              {weekDates.map((dateStr, col) =>
                renderDayCell(dateStr, col, dateStr.slice(0, 7) !== toYM(year, month)),
              )}
            </div>
          )}
        <div className="d-flex" style={{ borderTop: '1px solid #F7F8FA', backgroundColor: '#FAFBFC' }}>
          <button
            type="button"
            onClick={() => setCalendarExpanded((open) => !open)}
            className="btn flex-fill d-flex align-items-center justify-content-center gap-1 py-1"
            style={{
              border: 'none',
              backgroundColor: 'transparent',
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              color: '#6F767E',
              borderRadius: 0,
            }}
          >
            {calendarExpanded ? (
              <>
                <IoChevronUpOutline size={14} />
                달력 접기
              </>
            ) : (
              <>
                <IoChevronDownOutline size={14} />
                달력 펼치기
              </>
            )}
          </button>
        </div>
      </div>

      <TripTidePanel date={selectedDate} tideRegionId={region.id} variant="embedded" />

      <WindWeatherCard date={selectedDate} />

      {briefingLoaded ? <TideBriefingCard briefing={briefing} /> : null}
    </>
  );
}
