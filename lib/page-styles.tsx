'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

/** ute.or.kr 과 동일 계열 — SCDream(에스코어드림) */
export const OHGO_FONT = "var(--font-ohgo), 'SCDream', 'Noto Sans KR', system-ui, sans-serif";

/** 앱 셸 공통 최대 폭 (globals.css --ohgo-app-max-width 와 동일) */
export const OHGO_APP_MAX_WIDTH = 480;

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

/** 카드 안 리스트 항목 사이 인셋 구분선 (마이페이지·관리자 메뉴와 동일) */
export const OHGO_LIST_DIVIDER: CSSProperties = {
  height: 1,
  backgroundColor: '#F7F8FA',
  marginInline: 16,
};

/**
 * 리스트 행 공통 스펙 (마이페이지 기준)
 * - 행: padding 12×16, min-height 64, gap 12
 * - 아이콘 박스 40 / 글리프 20
 * - 미디어 썸네일 56
 * - 제목 15/600, 설명 13, 메타 12, chevron 18
 */
export const OHGO_LIST = {
  rowPaddingY: 12,
  rowPaddingX: 16,
  rowMinHeight: 64,
  gap: 12,
  iconBox: 40,
  iconGlyph: 20,
  thumbBox: 56,
  titleSize: 15,
  titleWeight: 600 as const,
  descSize: 13,
  metaSize: 12,
  labelSize: 12,
  valueSize: 15,
  chevronSize: 18,
  titleColor: '#1A1D1F',
  mutedColor: '#6F767E',
  chevronColor: '#ABABAB',
} as const;

export const OHGO_LIST_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: OHGO_LIST.gap,
  padding: `${OHGO_LIST.rowPaddingY}px ${OHGO_LIST.rowPaddingX}px`,
  minHeight: OHGO_LIST.rowMinHeight,
  boxSizing: 'border-box',
  border: 'none',
  borderRadius: 0,
  background: 'none',
  textAlign: 'left',
  width: '100%',
  fontFamily: OHGO_FONT,
};

export const OHGO_LIST_TITLE: CSSProperties = {
  fontSize: OHGO_LIST.titleSize,
  fontWeight: OHGO_LIST.titleWeight,
  color: OHGO_LIST.titleColor,
  fontFamily: OHGO_FONT,
  lineHeight: 1.35,
};

export const OHGO_LIST_DESC: CSSProperties = {
  fontSize: OHGO_LIST.descSize,
  color: OHGO_LIST.mutedColor,
  fontFamily: OHGO_FONT,
  lineHeight: 1.35,
  marginTop: 2,
};

export const OHGO_LIST_META: CSSProperties = {
  fontSize: OHGO_LIST.metaSize,
  color: OHGO_LIST.mutedColor,
  fontFamily: OHGO_FONT,
  lineHeight: 1.35,
};

export const OHGO_LIST_ICON_BOX: CSSProperties = {
  width: OHGO_LIST.iconBox,
  height: OHGO_LIST.iconBox,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

export const OHGO_LIST_THUMB: CSSProperties = {
  width: OHGO_LIST.thumbBox,
  height: OHGO_LIST.thumbBox,
  borderRadius: 12,
  flexShrink: 0,
  overflow: 'hidden',
  backgroundColor: '#F7F8FA',
  border: '1px solid #EFEFEF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
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
  // iOS/WebView: 16px 미만이면 input 포커스 시 자동 줌인됨
  fontSize: 16,
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


/** 페이지 부트 로딩 — 짧은 구간은 스피너 없이 배경만 (이동 중 토스트와 겹치는 깜빡임 방지) */
export function OhgoPageLoading() {
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSpinner(true), 350);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center"
      style={{ backgroundColor: '#F7F8FA' }}
      aria-busy="true"
    >
      {showSpinner ? (
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">로딩 중</span>
        </div>
      ) : null}
    </div>
  );
}
