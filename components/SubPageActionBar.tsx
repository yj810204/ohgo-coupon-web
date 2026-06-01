'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { OHGO_CARD, OHGO_FONT, OHGO_PRIMARY_BTN, OHGO_SECONDARY_BTN } from '@/lib/page-styles';

type SubPageActionBarVariant = 'danger' | 'primary' | 'secondary';

type SubPageActionBarProps = {
  label: string;
  onClick: () => void;
  icon?: IconType;
  /** 상단 보조 텍스트 (예: 총 12건) */
  meta?: ReactNode;
  variant?: SubPageActionBarVariant;
  disabled?: boolean;
  className?: string;
};

const VARIANT_CLASS: Record<SubPageActionBarVariant, string> = {
  danger: 'ohgo-modal__btn--danger',
  primary: 'ohgo-modal__btn--primary',
  secondary: 'ohgo-modal__btn--secondary',
};

const VARIANT_STYLE: Record<SubPageActionBarVariant, CSSProperties> = {
  danger: {
    backgroundColor: '#FF3B30',
    color: '#FFFFFF',
    border: 'none',
    boxShadow: '0 4px 12px rgba(255, 59, 48, 0.25)',
  },
  primary: OHGO_PRIMARY_BTN,
  secondary: OHGO_SECONDARY_BTN,
};

/**
 * 서브페이지 상단·목록 위 전역 액션 (전체 삭제, 내역 보기 등).
 * 오른쪽 작은 버튼 대신 카드 안 전체 너비 버튼으로 배치합니다.
 */
export default function SubPageActionBar({
  label,
  onClick,
  icon: Icon,
  meta,
  variant = 'danger',
  disabled,
  className = '',
}: SubPageActionBarProps) {
  return (
    <div className={`mb-3 ${className}`.trim()} style={{ ...OHGO_CARD, padding: '12px 14px' }}>
      {meta ? (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#6F767E',
            fontFamily: OHGO_FONT,
            marginBottom: 8,
          }}
        >
          {meta}
        </div>
      ) : null}
      <button
        type="button"
        className={`btn w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold ohgo-modal__btn ${VARIANT_CLASS[variant]}`}
        style={{
          ...VARIANT_STYLE[variant],
          opacity: disabled ? 0.65 : 1,
        }}
        onClick={onClick}
        disabled={disabled}
      >
        {Icon ? <Icon size={18} aria-hidden /> : null}
        {label}
      </button>
    </div>
  );
}
