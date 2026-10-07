'use client';

import { useEffect, useRef } from 'react';

export default function PickerValueInput({
  value,
  required,
  disabled,
  name,
  id,
  pattern,
  onFocus,
}: {
  value: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  pattern: string;
  onFocus: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.setCustomValidity('');
  }, [value, required]);

  return (
    <input
      ref={ref}
      id={id}
      name={name}
      value={value}
      required={required}
      disabled={disabled}
      pattern={pattern}
      inputMode="none"
      autoComplete="off"
      tabIndex={-1}
      aria-hidden="true"
      onChange={() => {}}
      onFocus={onFocus}
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        border: 0,
      }}
    />
  );
}
