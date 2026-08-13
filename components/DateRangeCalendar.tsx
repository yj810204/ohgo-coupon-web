'use client';

import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { IoChevronBackOutline, IoChevronForwardOutline } from 'react-icons/io5';
import { OHGO_FONT } from '@/lib/page-styles';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const RANGE_BG = '#237FFF';

type DateRangeCalendarProps = {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  /** 선택 불가 과거일 (기본: 오늘 이전) */
  minDate?: string;
  maxRangeDays?: number;
};

function toDate(value: string): Date | null {
  if (!value) return null;
  try {
    return parseISO(value);
  } catch {
    return null;
  }
}

export default function DateRangeCalendar({
  startDate,
  endDate,
  onChange,
  minDate,
  maxRangeDays = 62,
}: DateRangeCalendarProps) {
  const start = toDate(startDate);
  const end = toDate(endDate);
  const min = toDate(minDate || format(new Date(), 'yyyy-MM-dd'));

  const [viewMonth, setViewMonth] = useState(() => start || new Date());
  const [pickingEnd, setPickingEnd] = useState(Boolean(start && !end));

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);
  const cells: (Date | null)[] = [...Array(startPad).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const rangePreview = useMemo(() => {
    if (!start) return null;
    // 종료 전: 시작일만 강조 / 종료 후: 범위
    const rangeEnd = end && !isAfter(start, end) ? end : start;
    return { start, end: rangeEnd };
  }, [start, end]);

  const handleDayClick = (day: Date) => {
    if (min && isBefore(day, min)) return;

    const dayStr = format(day, 'yyyy-MM-dd');

    if (!start || (start && end) || !pickingEnd) {
      onChange(dayStr, '');
      setPickingEnd(true);
      return;
    }

    if (isBefore(day, start)) {
      onChange(dayStr, '');
      setPickingEnd(true);
      return;
    }

    const daysCount =
      Math.floor((day.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (daysCount > maxRangeDays) {
      alert(`한 번에 선택할 수 있는 기간은 최대 ${maxRangeDays}일입니다.`);
      return;
    }

    onChange(format(start, 'yyyy-MM-dd'), dayStr);
    setPickingEnd(false);
  };

  const isInRange = (day: Date) => {
    if (!rangePreview) return false;
    return !isBefore(day, rangePreview.start) && !isAfter(day, rangePreview.end);
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-2 px-1">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          aria-label="이전 달"
        >
          <IoChevronBackOutline size={18} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: OHGO_FONT }}>
          {format(viewMonth, 'yyyy년 M월')}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          aria-label="다음 달"
        >
          <IoChevronForwardOutline size={18} />
        </button>
      </div>

      <div className="d-flex mb-1">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: OHGO_FONT,
              color: i === 0 ? '#FF3B30' : i === 6 ? '#1B6FF5' : '#6F767E',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <div key={row} className="d-flex" style={{ marginBottom: 2 }}>
          {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
            if (!day || !isSameMonth(day, viewMonth)) {
              return <div key={col} style={{ flex: 1, minHeight: 44 }} aria-hidden />;
            }

            const disabled = Boolean(min && isBefore(day, min));
            const inRange = !disabled && isInRange(day);
            const isStart = Boolean(start && isSameDay(day, start));
            const isEnd = Boolean(end && isSameDay(day, end));
            const isSingle =
              inRange &&
              start &&
              ((!end && isStart) || (end && isSameDay(start, end) && isStart));

            const isSun = getDay(day) === 0;
            const isSat = getDay(day) === 6;

            let color = isSun ? '#FF3B30' : isSat ? '#1B6FF5' : '#1A1D1F';
            if (disabled) color = '#D0D5DD';
            else if (inRange) color = '#FFFFFF';

            // 연속 바: 구간 전체 동일 배경색 + 양끝만 둥글게
            let cellBg = 'transparent';
            let cellRadius = '0';
            if (inRange) {
              cellBg = RANGE_BG;
              if (isSingle || (isStart && isEnd)) {
                cellRadius = '999px';
              } else if (isStart) {
                cellRadius = '999px 0 0 999px';
              } else if (isEnd) {
                cellRadius = '0 999px 999px 0';
              }
            }

            return (
              <button
                key={col}
                type="button"
                disabled={disabled}
                onClick={() => handleDayClick(day)}
                className="btn p-0"
                style={{
                  flex: 1,
                  minHeight: 44,
                  border: 'none',
                  padding: '4px 0',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'stretch',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minHeight: 36,
                    margin: '0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: cellBg,
                    borderRadius: cellRadius,
                    color,
                    fontSize: 14,
                    fontWeight: isStart || isEnd || isSingle ? 700 : 600,
                    fontFamily: OHGO_FONT,
                  }}
                >
                  {format(day, 'd')}
                </span>
              </button>
            );
          })}
        </div>
      ))}

    </div>
  );
}
