'use client';

import { useState } from 'react';
import { supabaseListImageUrl } from '@/lib/supabase-image';
import {
  formatMarketPrice,
  marketCategoryLabel,
  marketTradeMethodLabel,
  type MarketListing,
} from '@/utils/market-service';

const FONT = 'var(--font-ohgo), sans-serif';

type MarketListingCardProps = {
  listing: MarketListing;
  onClick?: () => void;
};

export default function MarketListingCard({ listing, onClick }: MarketListingCardProps) {
  const sold = listing.status === 'sold';
  const imageUrl = listing.imageUrls[0];
  const thumbUrl = supabaseListImageUrl(imageUrl, 240);
  const [imgSrc, setImgSrc] = useState(thumbUrl || imageUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className="btn w-100 p-0 border-0 bg-white text-start overflow-hidden d-flex"
      style={{
        borderRadius: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        opacity: sold ? 0.55 : 1,
      }}
    >
      <div
        className="flex-shrink-0 overflow-hidden position-relative"
        style={{ width: 108, height: 108, backgroundColor: '#F7F8FA' }}
      >
        {imageUrl ? (
          <img
            src={imgSrc}
            alt=""
            width={108}
            height={108}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => {
              if (imageUrl && imgSrc !== imageUrl) setImgSrc(imageUrl);
            }}
          />
        ) : (
          <span
            className="d-flex align-items-center justify-content-center w-100 h-100"
            style={{ fontSize: 11, color: '#B0B8C4' }}
          >
            이미지 없음
          </span>
        )}
        {sold ? (
          <span
            className="position-absolute"
            style={{
              top: 6,
              left: 6,
              backgroundColor: 'rgba(26,29,31,0.78)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: FONT,
              borderRadius: 999,
              padding: '2px 7px',
            }}
          >
            판매완료
          </span>
        ) : null}
      </div>
      <div className="flex-grow-1 min-w-0 d-flex flex-column justify-content-center" style={{ padding: '10px 12px' }}>
        <div className="d-flex flex-wrap gap-1 mb-1">
          <span
            className="badge rounded-pill"
            style={{ backgroundColor: '#F2F3F5', color: '#6F767E', fontSize: 10, fontWeight: 700 }}
          >
            {marketCategoryLabel(listing.category)}
          </span>
          {marketTradeMethodLabel(listing.tradeArea) ? (
            <span
              className="badge rounded-pill text-truncate"
              style={{
                backgroundColor: '#EBF1FE',
                color: '#1B6FF5',
                fontSize: 10,
                fontWeight: 700,
                maxWidth: '100%',
              }}
            >
              {marketTradeMethodLabel(listing.tradeArea)}
            </span>
          ) : null}
        </div>
        <div
          className="fw-semibold"
          style={{
            fontSize: 14,
            color: '#1A1D1F',
            fontFamily: FONT,
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {listing.title}
        </div>
        <div style={{ fontSize: 14, color: '#1B6FF5', fontWeight: 700, fontFamily: FONT, marginTop: 6 }}>
          {formatMarketPrice(listing.price)}
        </div>
      </div>
    </button>
  );
}
