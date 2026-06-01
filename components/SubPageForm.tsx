'use client';

import type { CSSProperties, ReactNode } from 'react';
import { OHGO_CARD, OHGO_FONT, OHGO_PRIMARY_BTN, OHGO_SECONDARY_BTN } from '@/lib/page-styles';

const SECTION_CARD: CSSProperties = { ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 };

export function FormSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={SECTION_CARD}>
      <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function FormActions({
  onCancel,
  onSubmit,
  submitLabel,
  loading,
  loadingLabel,
  disabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="d-grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <button
        type="button"
        className="btn w-100 fw-semibold ohgo-modal__btn ohgo-modal__btn--secondary"
        style={OHGO_SECONDARY_BTN}
        onClick={onCancel}
        disabled={loading}
      >
        취소
      </button>
      <button
        type="button"
        className="btn w-100 fw-semibold ohgo-modal__btn ohgo-modal__btn--primary"
        style={{
          ...OHGO_PRIMARY_BTN,
          opacity: disabled || loading ? 0.65 : 1,
        }}
        onClick={onSubmit}
        disabled={disabled || loading}
      >
        {loading ? loadingLabel || '처리 중...' : submitLabel}
      </button>
    </div>
  );
}

export const FORM_LABEL: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  marginBottom: 6,
  display: 'block',
};
