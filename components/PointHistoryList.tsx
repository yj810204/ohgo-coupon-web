'use client';

import type { CSSProperties } from 'react';
import type { IconType } from 'react-icons';
import { format } from 'date-fns';
import EmptyState from '@/components/EmptyState';
import type { PointHistoryItem } from '@/utils/point-history-service';
import { OHGO_CARD, OHGO_FONT, OHGO_LIST_DIVIDER } from '@/lib/page-styles';

const FONT = OHGO_FONT;

function formatWhen(at: Date | null): string {
  if (!at) return '-';
  return format(at, 'yyyy.MM.dd HH:mm');
}

export default function PointHistoryList({
  items,
  loading,
  emptyIcon,
  emptyMessage,
}: {
  items: PointHistoryItem[];
  loading: boolean;
  emptyIcon: IconType;
  emptyMessage: string;
}) {
  if (loading) {
    return (
      <div className="py-5 text-center">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState icon={emptyIcon} message={emptyMessage} style={OHGO_CARD} />;
  }

  return (
    <div style={OHGO_CARD}>
      {items.map((item, idx) => {
        const earn = item.points >= 0;
        return (
          <div key={item.id}>
            {idx > 0 && <div style={OHGO_LIST_DIVIDER} />}
            <div className="d-flex align-items-start justify-content-between gap-3 px-3 py-3">
              <div className="flex-grow-1 min-w-0">
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>
                  {item.title}
                </div>
                {item.detail ? (
                  <div
                    className="text-truncate"
                    style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}
                  >
                    {item.detail}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: '#9A9FA5', fontFamily: FONT, marginTop: 4 }}>
                  {formatWhen(item.at)}
                </div>
              </div>
              <div
                className="flex-shrink-0"
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: earn ? '#1B6FF5' : '#FF3B30',
                  fontFamily: FONT,
                }}
              >
                {earn ? '+' : ''}
                {item.points.toLocaleString('ko-KR')}P
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const POINT_HISTORY_SUMMARY_CARD: CSSProperties = {
  ...OHGO_CARD,
  padding: 16,
};
