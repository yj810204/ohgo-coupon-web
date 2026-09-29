'use client';

import { useState } from 'react';
import { presetRange, validateRange, type BoardingRange } from '@/lib/boarding-ledger.shared';
import { getTodayDate } from '@/lib/kst-date';
import { OHGO_CARD, OHGO_FONT, OHGO_INPUT } from '@/lib/page-styles';

export type LedgerRangePreset = 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

const PRESETS: { id: LedgerRangePreset; label: string }[] = [
  { id: 'thisMonth', label: '이번 달' },
  { id: 'lastMonth', label: '지난달' },
  { id: 'thisYear', label: '올해' },
  { id: 'all', label: '전체' },
  { id: 'custom', label: '직접 선택' },
];

export function rangeForPreset(preset: LedgerRangePreset): BoardingRange | null {
  if (preset === 'all' || preset === 'custom') return null;
  return presetRange(preset, getTodayDate());
}

export default function LedgerRangeFilter({
  preset,
  range,
  onChange,
  allowAll = true,
}: {
  preset: LedgerRangePreset;
  range: BoardingRange | null;
  onChange: (preset: LedgerRangePreset, range: BoardingRange | null) => void;
  allowAll?: boolean;
}) {
  const [start, setStart] = useState(range?.startDate ?? '');
  const [end, setEnd] = useState(range?.endDate ?? '');
  const [error, setError] = useState('');

  const pick = (id: LedgerRangePreset) => {
    setError('');
    if (id === 'custom') {
      const base = range ?? presetRange('thisMonth', getTodayDate());
      setStart(base.startDate);
      setEnd(base.endDate);
      onChange('custom', base);
      return;
    }
    onChange(id, rangeForPreset(id));
  };

  const applyCustom = (nextStart: string, nextEnd: string) => {
    setStart(nextStart);
    setEnd(nextEnd);
    const result = validateRange(nextStart, nextEnd);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError('');
    onChange('custom', result.range);
  };

  return (
    <div className="p-3 mb-3" style={OHGO_CARD}>
      <div className="d-flex flex-wrap gap-2">
        {PRESETS.filter((p) => allowAll || p.id !== 'all').map((p) => {
          const active = p.id === preset;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.id)}
              style={{
                border: active ? '1px solid #1B6FF5' : '1px solid #E6E8EC',
                background: active ? '#EEF4FF' : '#FFFFFF',
                color: active ? '#1B6FF5' : '#33383F',
                borderRadius: 999,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                fontFamily: OHGO_FONT,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {preset === 'custom' && (
        <div className="d-flex align-items-center gap-2 mt-3">
          <input
            type="date"
            value={start}
            onChange={(e) => applyCustom(e.target.value, end)}
            style={{ ...OHGO_INPUT, flex: 1, minWidth: 0 }}
            aria-label="시작일"
          />
          <span style={{ color: '#6F767E', fontFamily: OHGO_FONT }}>~</span>
          <input
            type="date"
            value={end}
            onChange={(e) => applyCustom(start, e.target.value)}
            style={{ ...OHGO_INPUT, flex: 1, minWidth: 0 }}
            aria-label="종료일"
          />
        </div>
      )}
      {error && (
        <p style={{ color: '#E5484D', fontSize: 12, margin: '8px 0 0', fontFamily: OHGO_FONT }}>{error}</p>
      )}
      {range && preset !== 'custom' && (
        <p style={{ color: '#6F767E', fontSize: 12, margin: '8px 0 0', fontFamily: OHGO_FONT }}>
          {range.startDate} ~ {range.endDate}
        </p>
      )}
    </div>
  );
}
