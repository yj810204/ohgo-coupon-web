'use client';

import { useEffect, useRef } from 'react';
import { OHGO_FONT } from '@/lib/page-styles';
import {
  HOUR12_OPTIONS,
  MINUTE_OPTIONS,
  PERIOD_OPTIONS,
  type DayPeriod,
} from '@/lib/korean-picker';

function WheelColumn({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    selected?.scrollIntoView({ block: 'center' });
  }, [value]);

  const move = (delta: number) => {
    const index = options.findIndex((option) => option.value === value);
    const start = index < 0 ? (delta > 0 ? -1 : 0) : index;
    const next = options[Math.min(options.length - 1, Math.max(0, start + delta))];
    if (next) onChange(next.value);
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#6F767E', marginBottom: 6 }}>
        {label}
      </div>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            move(1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            move(-1);
          } else if (event.key === 'Home') {
            event.preventDefault();
            const first = options[0];
            if (first) onChange(first.value);
          } else if (event.key === 'End') {
            event.preventDefault();
            const last = options[options.length - 1];
            if (last) onChange(last.value);
          }
        }}
        style={{
          maxHeight: 180,
          overflowY: 'auto',
          border: '1px solid #EFEFEF',
          borderRadius: 12,
          background: '#FFFFFF',
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChange(option.value)}
              style={{
                display: 'block',
                width: '100%',
                border: 'none',
                background: selected ? '#237FFF' : 'transparent',
                color: selected ? '#FFFFFF' : '#1A1D1F',
                padding: '8px 0',
                fontSize: 16,
                fontWeight: 700,
                fontFamily: OHGO_FONT,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function KoreanTimeWheels({
  period,
  hour12,
  minute,
  onPeriod,
  onHour,
  onMinute,
}: {
  period: DayPeriod;
  hour12: string;
  minute: string;
  onPeriod: (next: DayPeriod) => void;
  onHour: (next: string) => void;
  onMinute: (next: string) => void;
}) {
  return (
    <div className="d-flex gap-2" style={{ fontFamily: OHGO_FONT }}>
      <WheelColumn
        label="오전 오후"
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(next) => onPeriod(next as DayPeriod)}
      />
      <WheelColumn label="시" options={HOUR12_OPTIONS} value={hour12} onChange={onHour} />
      <WheelColumn label="분" options={MINUTE_OPTIONS} value={minute} onChange={onMinute} />
    </div>
  );
}
