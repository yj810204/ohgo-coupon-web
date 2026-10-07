'use client';

import { IoChevronForwardOutline } from 'react-icons/io5';
import AppLink from '@/components/AppLink';

interface SectionHeaderProps {
  title: string;
  onViewAll?: () => void;
  viewAllHref?: string;
  showViewAll?: boolean;
  badge?: React.ReactNode;
}

export default function SectionHeader({ title, onViewAll, viewAllHref, showViewAll, badge }: SectionHeaderProps) {
  const showMore = Boolean(onViewAll) || Boolean(viewAllHref) || Boolean(showViewAll);
  const moreStyle = {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1B6FF5',
    fontFamily: 'var(--font-urbanist), system-ui, sans-serif',
    textDecoration: 'none',
  } as const;
  const more = (
    <>
      더보기
      <IoChevronForwardOutline size={16} aria-hidden />
    </>
  );
  return (
    <div className="d-flex align-items-center justify-content-between px-1" style={{ marginBottom: 8 }}>
      <div className="d-flex align-items-center gap-2">
        <h2
          className="mb-0"
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#1A1D1F',
            fontFamily: 'var(--font-urbanist), system-ui, sans-serif',
          }}
        >
          {title}
        </h2>
        {badge}
      </div>
      {showMore && (
        viewAllHref ? (
          <AppLink
            href={viewAllHref}
            className="btn btn-link p-0 text-decoration-none d-inline-flex align-items-center gap-1"
            style={moreStyle}
          >
            {more}
          </AppLink>
        ) : (
          <button
            type="button"
            onClick={onViewAll}
            className="btn btn-link p-0 text-decoration-none d-inline-flex align-items-center gap-1"
            style={moreStyle}
          >
            {more}
          </button>
        )
      )}
    </div>
  );
}
