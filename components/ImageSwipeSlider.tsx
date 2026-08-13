'use client';

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { OHGO_FONT } from '@/lib/page-styles';

type ImageSwipeSliderProps = {
  urls: string[];
  alt?: string;
  /** 슬라이드 영역 비율 (기본 4/3) */
  aspectRatio?: number;
  className?: string;
  style?: CSSProperties;
  onImageClick?: (url: string, index: number) => void;
};

export default function ImageSwipeSlider({
  urls,
  alt = '이미지',
  aspectRatio = 4 / 3,
  className,
  style,
  onImageClick,
}: ImageSwipeSliderProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const syncIndex = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth <= 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.max(0, Math.min(urls.length - 1, next)));
  }, [urls.length]);

  if (urls.length === 0) return null;

  const frameStyle: CSSProperties = {
    width: '100%',
    aspectRatio: String(aspectRatio),
    objectFit: 'cover',
    display: 'block',
    backgroundColor: '#111',
  };

  if (urls.length === 1) {
    return (
      <div className={className} style={{ position: 'relative', backgroundColor: '#111', ...style }}>
        <img
          src={urls[0]}
          alt={alt}
          className="w-100"
          style={frameStyle}
          onClick={() => onImageClick?.(urls[0], 0)}
        />
      </div>
    );
  }

  return (
    <div className={className} style={{ position: 'relative', backgroundColor: '#111', ...style }}>
      <div
        ref={scrollerRef}
        onScroll={syncIndex}
        className="ohgo-image-swipe"
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {urls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            style={{
              flex: '0 0 100%',
              width: '100%',
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
              backgroundColor: '#111',
            }}
          >
            <img
              src={url}
              alt={`${alt} ${i + 1}`}
              draggable={false}
              loading={i === 0 ? 'eager' : 'lazy'}
              style={{ ...frameStyle, userSelect: 'none' }}
              onClick={() => onImageClick?.(url, i)}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          padding: '4px 8px',
          borderRadius: 999,
          backgroundColor: 'rgba(26, 29, 31, 0.55)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          fontFamily: OHGO_FONT,
          lineHeight: 1.2,
          pointerEvents: 'none',
        }}
      >
        {index + 1}/{urls.length}
      </div>

      <div
        className="d-flex justify-content-center align-items-center gap-1"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 10,
          pointerEvents: 'none',
        }}
      >
        {urls.map((_, i) => (
          <span
            key={i}
            style={{
              width: i === index ? 16 : 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              transition: 'width 0.15s ease, background-color 0.15s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
