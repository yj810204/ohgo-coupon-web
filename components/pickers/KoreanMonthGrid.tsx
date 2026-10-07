'use client';

import { useState } from 'react';
import { IoChevronBackOutline, IoChevronForwardOutline } from 'react-icons/io5';
import { useHolidays } from '@/hooks/useHolidays';
import { shortHolidayName } from '@/lib/kr-holidays';
import { OHGO_FONT } from '@/lib/page-styles';
import {
  DAY_LABELS,
  buildMonthCells,
  dayTextColor,
  initialViewMonth,
  isDateDisabled,
  isDateValue,
  monthTitle,
  shiftDate,
  shiftMonth,
  todayDate,
} from '@/lib/korean-picker';

export default function KoreanMonthGrid({
  value,
  min,
  max,
  onSelect,
}: {
  value: string;
  min?: string;
  max?: string;
  onSelect: (date: string) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => initialViewMonth(value));
  const [focusDate, setFocusDate] = useState(() => (isDateValue(value) ? value : todayDate()));
  const holidays = useHolidays([viewMonth.getFullYear()]);
  const cells = buildMonthCells(viewMonth);

  const moveFocus = (delta: number) => {
    const base = isDateValue(focusDate) ? focusDate : todayDate();
    const next = shiftDate(base, delta);
    setFocusDate(next);
    setViewMonth(initialViewMonth(next));
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-2 px-1">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setViewMonth((month) => shiftMonth(month, -1))}
          aria-label="이전 달"
        >
          <IoChevronBackOutline size={18} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: OHGO_FONT }}>{monthTitle(viewMonth)}</span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setViewMonth((month) => shiftMonth(month, 1))}
          aria-label="다음 달"
        >
          <IoChevronForwardOutline size={18} />
        </button>
      </div>

      <div className="d-flex mb-1" aria-hidden>
        {DAY_LABELS.map((label, index) => (
          <div
            key={label}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: OHGO_FONT,
              color: index === 0 || index === 6 ? '#FF3B30' : '#6F767E',
            }}
          >
            {label}
          </div>
        ))}
      </div>

      <div
        role="grid"
        aria-label="날짜"
        onKeyDown={(event) => {
          const delta =
            event.key === 'ArrowLeft' ? -1 :
            event.key === 'ArrowRight' ? 1 :
            event.key === 'ArrowUp' ? -7 :
            event.key === 'ArrowDown' ? 7 :
            0;
          if (!delta) return;
          event.preventDefault();
          moveFocus(delta);
        }}
      >
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <div key={row} className="d-flex" role="row" style={{ marginBottom: 2 }}>
            {cells.slice(row * 7, row * 7 + 7).map((cell, col) => {
              if (!cell) {
                return <div key={col} style={{ flex: 1, minHeight: 44 }} aria-hidden />;
              }
              const disabled = isDateDisabled(cell.date, min, max);
              const selected = value === cell.date;
              const holidayName = holidays[cell.date];
              const focused = focusDate === cell.date;
              const color = dayTextColor({
                weekday: cell.weekday,
                holiday: Boolean(holidayName),
                selected,
                disabled,
              });
              return (
                <button
                  key={cell.date}
                  type="button"
                  role="gridcell"
                  disabled={disabled}
                  tabIndex={focused ? 0 : -1}
                  aria-selected={selected}
                  aria-label={holidayName ? `${cell.date} ${holidayName}` : cell.date}
                  title={holidayName || undefined}
                  onClick={() => onSelect(cell.date)}
                  onFocus={() => setFocusDate(cell.date)}
                  className="btn p-0"
                  style={{
                    flex: 1,
                    minHeight: 44,
                    border: 'none',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'stretch',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      position: 'relative',
                      flex: 1,
                      minHeight: 36,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 0,
                      background: selected ? '#237FFF' : 'transparent',
                      borderRadius: 999,
                      color,
                      fontSize: 14,
                      fontWeight: selected ? 700 : 600,
                      fontFamily: OHGO_FONT,
                    }}
                  >
                    {cell.day}
                    {holidayName ? (
                      <span
                        style={{
                          position: 'absolute',
                          top: 'calc(50% + 7px)',
                          left: 0,
                          right: 0,
                          textAlign: 'center',
                          padding: '0 2px',
                          fontSize: 9,
                          lineHeight: '11px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {shortHolidayName(holidayName)}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
