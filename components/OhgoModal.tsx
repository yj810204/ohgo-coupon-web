'use client';

import type { CSSProperties, ReactNode } from 'react';
import { OHGO_PRIMARY_BTN, OHGO_SECONDARY_BTN } from '@/lib/page-styles';

export type OhgoModalSize = 'default' | 'lg';

type OhgoModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: OhgoModalSize;
  scrollable?: boolean;
  closeOnBackdrop?: boolean;
  /** false면 body 좌우 패딩 없음 (목록형 본문) */
  bodyPadding?: boolean;
  /** footer 버튼 가로 배치 (2~3개 액션) */
  footerLayout?: 'stack' | 'row';
};

export default function OhgoModal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'default',
  scrollable = false,
  closeOnBackdrop = false,
  bodyPadding = true,
  footerLayout = 'stack',
}: OhgoModalProps) {
  if (!open) return null;

  const dialogClass = [
    'modal-dialog',
    'modal-dialog-centered',
    size === 'lg' ? 'modal-lg' : '',
    scrollable ? 'modal-dialog-scrollable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className="modal show d-block ohgo-modal-backdrop"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ohgo-modal-title"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div className={dialogClass} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0 ohgo-modal ohgo-modal__content">
          <div className="modal-header border-0 ohgo-modal__header">
            <h5 id="ohgo-modal-title" className="modal-title ohgo-modal__title mb-0">
              {title}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label="닫기"
            />
          </div>
          <div
            className={`modal-body border-0 ohgo-modal__body${bodyPadding ? '' : ' ohgo-modal__body--flush'}`}
          >
            {children}
          </div>
          {footer != null ? (
            <div
              className={`modal-footer border-0 ohgo-modal__footer${footerLayout === 'row' ? ' ohgo-modal__footer--row' : ''}`}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OhgoModalActions({ children }: { children: ReactNode }) {
  return <div className="d-grid gap-2">{children}</div>;
}

type OhgoModalButtonProps = {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
  disabled?: boolean;
};

const VARIANT_STYLES: Record<NonNullable<OhgoModalButtonProps['variant']>, CSSProperties> = {
  primary: OHGO_PRIMARY_BTN,
  secondary: OHGO_SECONDARY_BTN,
  success: {
    ...OHGO_PRIMARY_BTN,
    backgroundColor: '#34C759',
    boxShadow: '0 4px 12px rgba(52, 199, 89, 0.28)',
  },
  danger: {
    ...OHGO_PRIMARY_BTN,
    backgroundColor: '#FF3B30',
    boxShadow: '0 4px 12px rgba(255, 59, 48, 0.25)',
  },
  warning: {
    ...OHGO_PRIMARY_BTN,
    backgroundColor: '#FF9500',
    boxShadow: '0 4px 12px rgba(255, 149, 0, 0.28)',
  },
};

export function OhgoModalButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
}: OhgoModalButtonProps) {
  return (
    <button
      type="button"
      className={`btn w-100 fw-semibold ohgo-modal__btn ohgo-modal__btn--${variant}`}
      style={VARIANT_STYLES[variant]}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function OhgoModalField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ohgo-modal__field">
      <div className="ohgo-modal__field-label">{label}</div>
      <div className="ohgo-modal__field-value">{value}</div>
    </div>
  );
}

export function OhgoModalText({ children }: { children: ReactNode }) {
  return <p className="ohgo-modal__text mb-0">{children}</p>;
}
