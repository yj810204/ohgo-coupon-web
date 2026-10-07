'use client';

import { useCallback, useId, useState, type CSSProperties } from 'react';
import { OHGO_FONT } from '@/lib/page-styles';
import {
  formatKoreanDateTimeLabel,
  formatTimeValue,
  isDateDisabled,
  joinDateTimeLocal,
  parseTimeValue,
  splitDateTimeLocal,
  to12Hour,
  to24Hour,
  todayDate,
  type DayPeriod,
} from '@/lib/korean-picker';
import KoreanMonthGrid from '@/components/pickers/KoreanMonthGrid';
import KoreanPickerSheet from '@/components/pickers/KoreanPickerSheet';
import KoreanTimeWheels from '@/components/pickers/KoreanTimeWheels';
import PickerValueInput from '@/components/pickers/PickerValueInput';
import { pickerActionStyle } from '@/components/pickers/picker-buttons';

function draftTime(value: string): { period: DayPeriod; hour12: string; minute: string } {
  const parsed = parseTimeValue(value);
  if (!parsed) return { period: '오전', hour12: '', minute: '' };
  const clock = to12Hour(parsed.hour);
  return {
    period: clock.period,
    hour12: String(clock.hour12),
    minute: String(parsed.minute).padStart(2, '0'),
  };
}

export default function KoreanDateTimeField({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  name,
  id,
  ariaLabel,
  className,
  style,
  placeholder = '날짜와 시간 선택',
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
}) {
  const parts = splitDateTimeLocal(value);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(parts.date);
  const [clock, setClock] = useState(() => draftTime(parts.time));
  const autoId = useId();
  const fieldId = id || autoId;
  const label = formatKoreanDateTimeLabel(value);
  const today = todayDate();
  const todayDisabled = isDateDisabled(today, min, max);
  const timeReady = Boolean(clock.hour12 && clock.minute);

  const openSheet = () => {
    const next = splitDateTimeLocal(value);
    setDate(next.date);
    setClock(draftTime(next.time));
    setOpen(true);
  };

  const close = useCallback(() => setOpen(false), []);

  const confirm = () => {
    if (!date || !timeReady) return;
    const time = formatTimeValue(to24Hour(clock.period, Number(clock.hour12)), Number(clock.minute));
    const joined = joinDateTimeLocal(date, time);
    if (!joined) return;
    onChange(joined);
    close();
  };

  return (
    <div style={{ position: 'relative', minWidth: 0, flex: style?.flex }}>
      <button
        type="button"
        className={className}
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        aria-haspopup="dialog"
        data-picker-value={value}
        aria-expanded={open}
        onClick={openSheet}
        style={{
          width: '100%',
          textAlign: 'left',
          background: '#FFFFFF',
          color: label ? '#1A1D1F' : '#9A9FA5',
          fontFamily: OHGO_FONT,
          ...style,
        }}
      >
        {label || placeholder}
      </button>
      <PickerValueInput
        id={fieldId}
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        pattern="\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d"
        onFocus={() => {
          if (!disabled) openSheet();
        }}
      />
      <KoreanPickerSheet open={open} title={ariaLabel || '날짜와 시간'} onClose={close}>
        <KoreanMonthGrid value={date} min={min} max={max} onSelect={setDate} />
        <div style={{ height: 12 }} />
        <KoreanTimeWheels
          period={clock.period}
          hour12={clock.hour12}
          minute={clock.minute}
          onPeriod={(period) => setClock((prev) => ({ ...prev, period }))}
          onHour={(hour12) => setClock((prev) => ({ ...prev, hour12 }))}
          onMinute={(minute) => setClock((prev) => ({ ...prev, minute }))}
        />
        <div className="d-flex gap-2 mt-3">
          <button
            type="button"
            disabled={todayDisabled}
            onClick={() => {
              if (!todayDisabled) setDate(today);
            }}
            style={pickerActionStyle(false)}
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => {
              onChange('');
              close();
            }}
            style={pickerActionStyle(false)}
          >
            지우기
          </button>
          <button
            type="button"
            disabled={!date || !timeReady}
            onClick={confirm}
            style={pickerActionStyle(true)}
          >
            확인
          </button>
        </div>
      </KoreanPickerSheet>
    </div>
  );
}
