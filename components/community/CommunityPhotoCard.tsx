'use client';

import { useState } from 'react';
import { IoChatbubblesOutline } from 'react-icons/io5';
import { COMMUNITY_POST_DELETED_MESSAGE } from '@/utils/community-service';
import { supabaseListImageUrl } from '@/lib/supabase-image';
import BlurFillImage from '@/components/BlurFillImage';

const FONT = "var(--font-ohgo), sans-serif";

type CommunityPhotoCardProps = {
  title: string;
  imageUrl?: string;
  author?: string;
  date?: string;
  commentCount?: number;
  isDeleted?: boolean;
  isNotice?: boolean;
  onClick?: () => void;
};

export default function CommunityPhotoCard({
  title,
  imageUrl,
  author,
  date,
  commentCount = 0,
  isDeleted = false,
  isNotice = false,
  onClick,
}: CommunityPhotoCardProps) {
  const meta = [author, date].filter(Boolean).join(' · ');
  const thumbUrl = supabaseListImageUrl(imageUrl, 480, 'contain');
  const [imgSrc, setImgSrc] = useState(thumbUrl || imageUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className="btn w-100 p-0 text-start border-0 bg-white overflow-hidden"
      style={{
        borderRadius: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <div
        className="w-100 d-flex align-items-center justify-content-center overflow-hidden position-relative"
        style={{ aspectRatio: '4 / 3', backgroundColor: '#F2F3F5' }}
      >
        {isNotice ? (
          <span
            className="position-absolute"
            style={{
              top: 8,
              left: 8,
              zIndex: 2,
              fontSize: 11,
              fontWeight: 800,
              fontFamily: FONT,
              color: '#fff',
              backgroundColor: '#C62828',
              borderRadius: 6,
              padding: '3px 8px',
            }}
          >
            공지
          </span>
        ) : null}
        {isDeleted || !imageUrl ? (
          <div
            className="d-flex align-items-center justify-content-center h-100 w-100"
            style={{
              color: '#6F767E',
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              padding: 12,
              textAlign: 'center',
            }}
          >
            {isDeleted ? COMMUNITY_POST_DELETED_MESSAGE : title}
          </div>
        ) : (
          <BlurFillImage
            src={imgSrc}
            alt={title}
            loading="lazy"
            onError={() => {
              if (imageUrl && imgSrc !== imageUrl) setImgSrc(imageUrl);
            }}
          />
        )}
      </div>
      <div
        style={{
          padding: '10px 12px 12px',
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #EEF0F3',
        }}
      >
        <div
          className="text-truncate"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#1A1D1F',
            fontFamily: FONT,
            lineHeight: 1.35,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div className="d-flex align-items-center justify-content-between gap-2">
          <span
            className="text-truncate"
            style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}
          >
            {meta}
          </span>
          {commentCount > 0 ? (
            <span
              className="d-flex align-items-center gap-1 flex-shrink-0"
              style={{ fontSize: 12, color: '#1B6FF5', fontFamily: FONT, fontWeight: 600 }}
            >
              <IoChatbubblesOutline size={13} />
              {commentCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
