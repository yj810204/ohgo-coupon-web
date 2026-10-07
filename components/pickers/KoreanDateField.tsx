'use client';

import { useCallback, useId, useState, type CSSProperties } from 'react';
import { OHGO_FONT } from '@/lib/page-styles';
import {
  formatKoreanDateLabel,
  isDateDisabled,
  todayDate,
} from '@/lib/korean-picker';
import KoreanMonthGrid from '@/components/pickers/KoreanMonthGrid';
import KoreanPickerSheet from '@/components/pickers/KoreanPickerSheet';
import PickerValueInput from '@/components/pickers/PickerValueInput';
import { pickerActionStyle } from '@/components/pickers/picker-buttons';

export default function KoreanDateField({
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
  placeholder = '날짜 선택',
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
  const [open, setOpen] = useState(false);
  const autoId = useId();
  const fieldId = id || autoId;
  const label = formatKoreanDateLabel(value);
  const today = todayDate();
  const todayDisabled = isDateDisabled(today, min, max);

  const close = useCallback(() => setOpen(false), []);

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
        onClick={() => setOpen(true)}
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
        pattern="\\d{4}-\\d{2}-\\d{2}"
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
      />
      <KoreanPickerSheet open={open} title={ariaLabel || '날짜'} onClose={close}>
        <KoreanMonthGrid
          value={value}
          min={min}
          max={max}
          onSelect={(date) => {
            onChange(date);
            close();
          }}
        />
        <div className="d-flex gap-2 mt-3">
          <button
            type="button"
            disabled={todayDisabled}
            onClick={() => {
              if (todayDisabled) return;
              onChange(today);
              close();
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
        </div>
      </KoreanPickerSheet>
    </div>
  );
}
