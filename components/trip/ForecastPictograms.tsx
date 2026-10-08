'use client';

import type { ReactNode } from 'react';
import { IoChevronForwardOutline } from 'react-icons/io5';
import AppLink from '@/components/AppLink';

const FONT = 'var(--font-ohgo), sans-serif';

export function SectionPictogram({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

export function TideMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#F5A524"
        transform="translate(6.4 -0.4) scale(0.5)"
        d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162z"
      />
      <path
        d="M2 16.6c1.3-1.6 2.7-1.6 4 0s2.7 1.6 4 0 2.7-1.6 4 0 2.7 1.6 4 0 2.7-1.6 4 0"
        fill="none"
        stroke="#1B6FF5"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M2 20.4c1.3-1.6 2.7-1.6 4 0s2.7 1.6 4 0 2.7-1.6 4 0 2.7 1.6 4 0 2.7-1.6 4 0"
        fill="none"
        stroke="#8EBAF0"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WindMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 8.5h11.2a2.6 2.6 0 1 0-2.4-3.6"
        fill="none"
        stroke="#3D7AB5"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M3 12.2h15.4a2.8 2.8 0 1 1-2.5 4.1"
        fill="none"
        stroke="#1B6FF5"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M3 16h8.2a2.2 2.2 0 1 1-1.8 3.4"
        fill="none"
        stroke="#8AA0B8"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PictogramSectionHeader({
  title,
  icon,
  onViewAll,
  viewAllHref,
  showViewAll,
}: {
  title: string;
  icon: ReactNode;
  onViewAll?: () => void;
  viewAllHref?: string;
  showViewAll?: boolean;
}) {
  const moreStyle = {
    border: 'none',
    background: 'none',
    color: '#1B6FF5',
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: 600,
  } as const;
  const more = (
    <>
      더보기 <IoChevronForwardOutline size={14} />
    </>
  );
  return (
    <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8, gap: 8 }}>
      <div className="d-flex align-items-center gap-2 min-w-0">
        {icon}
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 17,
            fontWeight: 800,
            color: '#1A1D1F',
            fontFamily: FONT,
          }}
        >
          {title}
        </span>
      </div>
      {onViewAll || viewAllHref || showViewAll ? (
        viewAllHref ? (
          <AppLink
            href={viewAllHref}
            className="btn p-0 d-flex align-items-center gap-1 flex-shrink-0"
            style={moreStyle}
          >
            {more}
          </AppLink>
        ) : (
          <button
            type="button"
            onClick={onViewAll}
            className="btn p-0 d-flex align-items-center gap-1 flex-shrink-0"
            style={moreStyle}
          >
            {more}
          </button>
        )
      ) : null}
    </div>
  );
}
