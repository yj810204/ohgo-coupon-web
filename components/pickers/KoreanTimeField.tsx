'use client';

import { useCallback, useId, useState, type CSSProperties } from 'react';
import { OHGO_FONT } from '@/lib/page-styles';
import {
  formatKoreanTimeLabel,
  formatTimeValue,
  parseTimeValue,
  to12Hour,
  to24Hour,
  type DayPeriod,
} from '@/lib/korean-picker';
import KoreanPickerSheet from '@/components/pickers/KoreanPickerSheet';
import KoreanTimeWheels from '@/components/pickers/KoreanTimeWheels';
import PickerValueInput from '@/components/pickers/PickerValueInput';
import { pickerActionStyle } from '@/components/pickers/picker-buttons';

function draftFromValue(value: string): { period: DayPeriod; hour12: string; minute: string } {
  const parsed = parseTimeValue(value);
  if (!parsed) return { period: '오전', hour12: '', minute: '' };
  const clock = to12Hour(parsed.hour);
  return {
    period: clock.period,
    hour12: String(clock.hour12),
    minute: String(parsed.minute).padStart(2, '0'),
  };
}

export default function KoreanTimeField({
  value,
  onChange,
  required,
  disabled,
  name,
  id,
  ariaLabel,
  className,
  style,
  placeholder = '시간 선택',
}: {
  value: string;
  onChange: (value: string) => void;
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
  const [draft, setDraft] = useState(() => draftFromValue(value));
  const autoId = useId();
  const fieldId = id || autoId;
  const label = formatKoreanTimeLabel(value);

  const openSheet = () => {
    setDraft(draftFromValue(value));
    setOpen(true);
  };

  const close = useCallback(() => setOpen(false), []);

  const confirm = () => {
    if (!draft.hour12 || !draft.minute) return;
    onChange(formatTimeValue(to24Hour(draft.period, Number(draft.hour12)), Number(draft.minute)));
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
        pattern="(?:[01]\\d|2[0-3]):[0-5]\\d"
        onFocus={() => {
          if (!disabled) openSheet();
        }}
      />
      <KoreanPickerSheet open={open} title={ariaLabel || '시간'} onClose={close}>
        <KoreanTimeWheels
          period={draft.period}
          hour12={draft.hour12}
          minute={draft.minute}
          onPeriod={(period) => setDraft((prev) => ({ ...prev, period }))}
          onHour={(hour12) => setDraft((prev) => ({ ...prev, hour12 }))}
          onMinute={(minute) => setDraft((prev) => ({ ...prev, minute }))}
        />
        <div className="d-flex gap-2 mt-3">
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
            disabled={!draft.hour12 || !draft.minute}
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
