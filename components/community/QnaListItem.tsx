'use client';

import { useState } from 'react';
import { IoChatbubbleEllipsesOutline, IoCheckmarkCircle } from 'react-icons/io5';
import { supabaseListImageUrl } from '@/lib/supabase-image';
import { OHGO_CARD, OHGO_FONT } from '@/lib/page-styles';

type QnaListItemProps = {
  title: string;
  excerpt?: string;
  imageUrl?: string;
  author?: string;
  date?: string;
  commentCount?: number;
  isDeleted?: boolean;
  badge?: 'Q' | 'TIP';
  commentLabel?: string;
  accepted?: boolean;
  categoryLabel?: string;
  notice?: boolean;
  compact?: boolean;
  onClick?: () => void;
};

export default function QnaListItem({
  title,
  excerpt,
  imageUrl,
  author,
  date,
  commentCount = 0,
  isDeleted = false,
  badge = 'Q',
  commentLabel = '답변',
  accepted = false,
  categoryLabel,
  notice = false,
  compact = false,
  onClick,
}: QnaListItemProps) {
  const showExcerpt = !compact && Boolean(excerpt && excerpt.trim().length >= 8 && !isDeleted);
  const thumbUrl = supabaseListImageUrl(imageUrl, compact ? 96 : 160);
  const [imgSrc, setImgSrc] = useState(thumbUrl || imageUrl);
  const isTip = badge === 'TIP';
  const accent = isTip ? '#E65100' : '#1B6FF5';
  const accentBg = isTip ? '#FFF4E5' : '#EBF1FE';
  const status = accepted
    ? { label: '채택완료', bg: '#E8F8EE', color: '#2E7D32', border: '#BFE7CD' }
    : commentCount > 0
      ? { label: `${commentLabel} ${commentCount}`, bg: accentBg, color: accent, border: 'transparent' }
      : { label: isTip ? '안내' : '답변대기', bg: '#F2F3F5', color: '#8A9199', border: 'transparent' };
  const categoryText = categoryLabel || (isTip ? '팁 · FAQ' : 'Q&A');
  const meta = [author, date].filter(Boolean).join(' · ');

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-100 text-start border-0"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 12,
          paddingRight: 12,
          minHeight: 40,
          backgroundColor: 'transparent',
          borderRadius: 0,
          boxShadow: 'none',
          cursor: 'pointer',
        }}
      >
        {notice ? (
          <span
            className="flex-shrink-0"
            style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: OHGO_FONT,
              color: '#C62828',
              lineHeight: 1.35,
            }}
          >
            [공지]
          </span>
        ) : null}
        <span
          className="flex-shrink-0"
          style={{
            fontSize: 14,
            fontWeight: 700,
            fontFamily: OHGO_FONT,
            color: accent,
            lineHeight: 1.35,
          }}
        >
          [{categoryText}]
        </span>
        <span
          className="text-truncate flex-grow-1"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: isDeleted ? '#8A9199' : '#1A1D1F',
            fontFamily: OHGO_FONT,
            lineHeight: 1.35,
            minWidth: 0,
          }}
        >
          {title}
          <span style={{ fontWeight: 700, color: '#8A9199' }}>({commentCount})</span>
        </span>
        <span
          className="flex-shrink-0"
          style={{
            fontSize: 13,
            color: '#8A9199',
            fontFamily: OHGO_FONT,
            whiteSpace: 'nowrap',
            marginLeft: 8,
          }}
        >
          {[date, author].filter(Boolean).join(' ')}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="btn w-100 p-0 text-start border-0 overflow-hidden"
      style={{
        ...OHGO_CARD,
        borderLeft: notice ? '3px solid #C62828' : accepted ? '3px solid #2E7D32' : `3px solid ${accent}`,
      }}
    >
      <div style={{ padding: '14px 16px 12px' }}>
        <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
          <div className="d-flex align-items-center gap-1 min-w-0">
            {notice ? (
              <span
                className="d-inline-flex align-items-center flex-shrink-0"
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: OHGO_FONT,
                  color: '#fff',
                  backgroundColor: '#C62828',
                  borderRadius: 6,
                  padding: '3px 8px',
                }}
              >
                공지
              </span>
            ) : null}
            <span
              className="d-inline-flex align-items-center"
              style={{
                fontSize: 11,
                fontWeight: 800,
                fontFamily: OHGO_FONT,
                color: accent,
                backgroundColor: accentBg,
                borderRadius: 6,
                padding: '3px 8px',
                letterSpacing: '-0.02em',
              }}
            >
              {categoryText}
            </span>
          </div>
          <span
            className="d-inline-flex align-items-center flex-shrink-0"
            style={{
              gap: 4,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: OHGO_FONT,
              backgroundColor: status.bg,
              color: status.color,
              border: `1px solid ${status.border}`,
              borderRadius: 999,
              padding: '4px 10px',
            }}
          >
            {accepted ? <IoCheckmarkCircle size={13} /> : null}
            {status.label}
          </span>
        </div>

        <div className="d-flex align-items-start" style={{ gap: 12 }}>
          <div className="flex-grow-1 min-w-0">
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: isDeleted ? '#8A9199' : '#1A1D1F',
                fontFamily: OHGO_FONT,
                lineHeight: 1.45,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {title}
            </div>
            {showExcerpt ? (
              <div
                style={{
                  fontSize: 13,
                  color: '#6F767E',
                  fontFamily: OHGO_FONT,
                  lineHeight: 1.55,
                  marginTop: 6,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {excerpt}
              </div>
            ) : null}
          </div>
          {imageUrl && !isDeleted ? (
            <div
              className="flex-shrink-0 overflow-hidden"
              style={{ width: 68, height: 68, borderRadius: 12, backgroundColor: '#F2F3F5' }}
            >
              <img
                src={imgSrc}
                alt=""
                width={68}
                height={68}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                loading="lazy"
                onError={() => {
                  if (imageUrl && imgSrc !== imageUrl) setImgSrc(imageUrl);
                }}
              />
            </div>
          ) : null}
        </div>

        <div
          className="d-flex align-items-center justify-content-between gap-2"
          style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #F2F3F5' }}
        >
          <span
            className="text-truncate"
            style={{ fontSize: 12, color: '#8A9199', fontFamily: OHGO_FONT }}
          >
            {meta}
          </span>
          <span
            className="d-inline-flex align-items-center flex-shrink-0"
            style={{
              gap: 4,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: OHGO_FONT,
              color: commentCount > 0 ? accent : '#ABABAB',
            }}
          >
            <IoChatbubbleEllipsesOutline size={14} />
            {commentLabel} {commentCount}
          </span>
        </div>
      </div>
    </button>
  );
}
