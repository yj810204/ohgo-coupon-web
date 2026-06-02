'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { IconType } from 'react-icons';
import {
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
} from '@/lib/page-styles';

export type OhgoModalSize = 'default' | 'lg';
export type OhgoModalTitleTone = 'default' | 'danger' | 'brand';

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
  /** footer 버튼 가로 배치 (기본: row — Travelia bottom sheet) */
  footerLayout?: 'stack' | 'row';
  /** 제목 색 (위험·강조 액션 등) */
  titleTone?: OhgoModalTitleTone;
};

export default function OhgoModal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'default',
  scrollable = true,
  closeOnBackdrop = true,
  bodyPadding = true,
  footerLayout = 'row',
  titleTone = 'default',
}: OhgoModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.setAttribute('data-ohgo-modal-open', 'true');
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.removeAttribute('data-ohgo-modal-open');
    };
  }, [open]);

  if (!open || !mounted) return null;

  const dialogClass = [
    'modal-dialog',
    'ohgo-modal-dialog',
    size === 'lg' ? 'ohgo-modal-dialog--lg' : '',
    scrollable ? 'ohgo-modal-dialog--scroll' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const titleClass = [
    'modal-title',
    'ohgo-modal__title',
    'mb-0',
    titleTone !== 'default' ? `ohgo-modal__title--${titleTone}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className="modal show d-block ohgo-modal-backdrop ohgo-modal--sheet"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ohgo-modal-title"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div className={dialogClass} onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0 ohgo-modal ohgo-modal__content">
          <div className="ohgo-modal__handle" aria-hidden />
          <div className="modal-header border-0 ohgo-modal__header">
            <h5 id="ohgo-modal-title" className={titleClass}>
              {title}
            </h5>
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
    </div>,
    document.body
  );
}

export function OhgoModalActions({ children }: { children: ReactNode }) {
  return <div className="ohgo-modal__footer-actions">{children}</div>;
}

type OhgoModalButtonProps = {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
  disabled?: boolean;
  className?: string;
};

const VARIANT_STYLES: Record<NonNullable<OhgoModalButtonProps['variant']>, React.CSSProperties> = {
  primary: OHGO_CONFIRM_BTN,
  secondary: OHGO_DISMISS_BTN,
  success: {
    ...OHGO_CONFIRM_BTN,
    backgroundColor: '#34C759',
  },
  danger: {
    ...OHGO_CONFIRM_BTN,
    backgroundColor: '#FF3B30',
  },
  warning: {
    ...OHGO_CONFIRM_BTN,
    backgroundColor: '#FF9500',
  },
};

export function OhgoModalButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className,
}: OhgoModalButtonProps) {
  return (
    <button
      type="button"
      className={[
        'btn fw-semibold ohgo-modal__btn',
        `ohgo-modal__btn--${variant}`,
        variant === 'secondary' ? OHGO_DISMISS_BTN_CLASS : '',
        variant === 'primary' ? OHGO_CONFIRM_BTN_CLASS : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={VARIANT_STYLES[variant]}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

type OhgoModalInfoRowProps = {
  icon: IconType;
  /** 날짜 행 — 파란 배경 전체 */
  variant?: 'date' | 'default';
  label?: string;
  value: ReactNode;
};

/** 하단 시트 정보 행 (날짜·시간·어종 등) */
export function OhgoModalInfoRow({ icon: Icon, variant = 'default', label, value }: OhgoModalInfoRowProps) {
  const isDate = variant === 'date';
  return (
    <div className={`ohgo-modal__info-row${isDate ? ' ohgo-modal__info-row--date' : ''}`}>
      <span
        className={`ohgo-modal__info-icon${isDate ? ' ohgo-modal__info-icon--brand' : ' ohgo-modal__info-icon--muted'}`}
        aria-hidden
      >
        <Icon size={isDate ? 22 : 18} color={isDate ? '#FFFFFF' : '#237FFF'} />
      </span>
      <div className="ohgo-modal__info-text">
        {label ? <span className="ohgo-modal__info-label">{label}</span> : null}
        <span className="ohgo-modal__info-value">{value}</span>
      </div>
    </div>
  );
}

export function OhgoModalInfoList({ children }: { children: ReactNode }) {
  return (
    <div className="ohgo-modal__info-card">
      <div className="ohgo-modal__info-list">{children}</div>
    </div>
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
