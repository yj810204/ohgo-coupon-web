'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { OHGO_FONT } from '@/lib/page-styles';
import BlurFillImage from '@/components/BlurFillImage';

type ImageSwipeSliderProps = {
  urls: string[];
  alt?: string;
  /** 슬라이드 영역 비율 (기본 4/3) */
  aspectRatio?: number;
  className?: string;
  style?: CSSProperties;
  onImageClick?: (url: string, index: number) => void;
  /** 자동 넘김 간격(ms). 0 이면 끔. 사용자가 만지면 잠시 멈췄다가 다시 재생 */
  autoPlayMs?: number;
};

const RESUME_AFTER_INTERACTION_MS = 6000;
const DRAG_CLICK_THRESHOLD_PX = 6;

export default function ImageSwipeSlider({
  urls,
  alt = '이미지',
  aspectRatio = 4 / 3,
  className,
  style,
  onImageClick,
  autoPlayMs = 0,
}: ImageSwipeSliderProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pausedUntilRef = useRef(0);
  const dragRef = useRef<{ pointerId: number; startX: number; startScroll: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const count = urls.length;

  const syncIndex = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth <= 0) return;
    const next = Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));
    indexRef.current = next;
    setIndex(next);
  }, [count]);

  const goTo = useCallback(
    (target: number) => {
      const el = scrollerRef.current;
      if (!el || count === 0) return;
      const next = ((target % count) + count) % count;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    },
    [count],
  );

  const pauseAutoPlay = useCallback(() => {
    pausedUntilRef.current = Date.now() + RESUME_AFTER_INTERACTION_MS;
  }, []);

  useEffect(() => {
    if (!autoPlayMs || count < 2) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      if (document.hidden || dragRef.current || Date.now() < pausedUntilRef.current) return;
      goTo(indexRef.current + 1);
    }, autoPlayMs);
    return () => window.clearInterval(timer);
  }, [autoPlayMs, count, goTo]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pauseAutoPlay();
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    el.style.scrollSnapType = 'none';
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || !el || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) > DRAG_CLICK_THRESHOLD_PX) {
      drag.moved = true;
      el.setPointerCapture(e.pointerId);
    }
    if (drag.moved) el.scrollLeft = drag.startScroll - dx;
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || !el || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    el.style.scrollSnapType = '';
    if (!drag.moved) return;
    suppressClickRef.current = true;
    const dx = e.clientX - drag.startX;
    const from = Math.round(drag.startScroll / el.clientWidth);
    const step = Math.abs(dx) > el.clientWidth * 0.15 ? (dx < 0 ? 1 : -1) : 0;
    goTo(Math.max(0, Math.min(count - 1, from + step)));
    pauseAutoPlay();
  };

  if (urls.length === 0) return null;

  const frame: CSSProperties = {
    width: '100%',
    aspectRatio: String(aspectRatio),
    cursor: onImageClick ? 'pointer' : undefined,
  };

  if (urls.length === 1) {
    return (
      <div className={className} style={{ position: 'relative', ...style }}>
        <BlurFillImage
          src={urls[0]}
          alt={alt}
          tone="light"
          style={frame}
          onClick={() => onImageClick?.(urls[0], 0)}
        />
      </div>
    );
  }

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <div
        ref={scrollerRef}
        onScroll={syncIndex}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={pauseAutoPlay}
        onClickCapture={(e) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        className="ohgo-image-swipe"
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          cursor: 'grab',
          userSelect: 'none',
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
            }}
          >
            <BlurFillImage
              src={url}
              alt={`${alt} ${i + 1}`}
              tone="light"
              draggable={false}
              loading={i === 0 ? 'eager' : 'lazy'}
              style={frame}
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
          zIndex: 2,
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
          zIndex: 2,
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
