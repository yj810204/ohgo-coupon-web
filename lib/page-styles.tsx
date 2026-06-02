'use client';

import type { CSSProperties } from 'react';

export const OHGO_FONT = "'Urbanist', var(--font-urbanist), sans-serif";

export const OHGO_CARD: CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
};

/** 리스트·카드 강조 — 왼쪽 세로선 대신 배경·얇은 테두리 */
export const OHGO_CARD_EMPHASIS: CSSProperties = {
  backgroundColor: '#EBF1FE',
  border: '1.5px solid #C7D9FD',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(27,111,245,0.08)',
};

export const OHGO_LIST_SELECTED: CSSProperties = {
  backgroundColor: '#EBF1FE',
};

export function ohgoListRowStyle(options?: {
  selected?: boolean;
  muted?: boolean;
}): CSSProperties {
  if (options?.selected) return { ...OHGO_LIST_SELECTED };
  if (options?.muted) return { backgroundColor: '#FAFAFA' };
  return { backgroundColor: '#FFFFFF' };
}

export const OHGO_INPUT: CSSProperties = {
  borderRadius: 10,
  border: '2px solid #EFEFEF',
  padding: '10px 12px',
  fontFamily: OHGO_FONT,
  fontSize: 14,
  color: '#1A1D1F',
};

/**
 * 확인·저장·OK 공통 — Travelia OK Button (Figma node 56517:32683)
 * @see https://www.figma.com/design/g1kWumlVq6GAwpoIvU1229/...?node-id=56517-32683
 */
export const OHGO_CONFIRM_BTN_CLASS = 'ohgo-btn-confirm';

export const OHGO_CONFIRM_BTN: CSSProperties = {
  backgroundColor: '#237FFF',
  color: '#FFFFFF',
  borderRadius: 1000,
  padding: '16px',
  border: 'none',
  fontFamily: OHGO_FONT,
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: '0.2px',
  lineHeight: 1.6,
  boxShadow: 'none',
};

/** @deprecated OHGO_CONFIRM_BTN 사용 */
export const OHGO_PRIMARY_BTN: CSSProperties = OHGO_CONFIRM_BTN;

/**
 * 닫기·취소 공통 — Travelia UI Kit (Figma node 56517:32682)
 * @see https://www.figma.com/design/g1kWumlVq6GAwpoIvU1229/...?node-id=56517-32682
 */
export const OHGO_DISMISS_BTN_CLASS = 'ohgo-btn-dismiss';

export const OHGO_DISMISS_BTN: CSSProperties = {
  backgroundColor: '#EDF5FF',
  color: '#237FFF',
  borderRadius: 1000,
  padding: '16px',
  border: 'none',
  fontFamily: OHGO_FONT,
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: '0.2px',
  lineHeight: 1.6,
  boxShadow: 'none',
};

/** @deprecated OHGO_DISMISS_BTN 사용 */
export const OHGO_SECONDARY_BTN: CSSProperties = OHGO_DISMISS_BTN;


export function OhgoPageLoading() {
  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center"
      style={{ backgroundColor: '#F7F8FA' }}
    >
      <div className="spinner-border text-primary" role="status" />
    </div>
  );
}
