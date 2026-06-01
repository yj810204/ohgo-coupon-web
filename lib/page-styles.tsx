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

export const OHGO_PRIMARY_BTN: CSSProperties = {
  backgroundColor: '#1B6FF5',
  color: '#fff',
  borderRadius: 14,
  padding: '13px',
  border: 'none',
  fontFamily: OHGO_FONT,
  fontSize: 15,
  fontWeight: 600,
  boxShadow: '0 4px 12px rgba(27,111,245,0.3)',
};

export const OHGO_SECONDARY_BTN: CSSProperties = {
  backgroundColor: '#FFFFFF',
  color: '#1A1D1F',
  borderRadius: 14,
  padding: '13px',
  border: '1.5px solid #D0D5DD',
  fontFamily: OHGO_FONT,
  fontSize: 15,
  fontWeight: 600,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};


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
