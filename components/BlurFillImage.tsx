'use client';

import type { CSSProperties } from 'react';

type BlurFillImageProps = {
  src: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
  onClick?: () => void;
  onError?: () => void;
  /** 카드처럼 밝은 면은 light, 상세 슬라이더는 dark */
  tone?: 'light' | 'dark';
};

export default function BlurFillImage({
  src,
  alt = '',
  className,
  style,
  loading,
  draggable = true,
  onClick,
  onError,
  tone = 'light',
}: BlurFillImageProps) {
  const wash = tone === 'dark' ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.35)';

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        loading={loading}
        style={{
          position: 'absolute',
          inset: -16,
          width: 'calc(100% + 32px)',
          height: 'calc(100% + 32px)',
          objectFit: 'cover',
          filter: 'blur(22px)',
          transform: 'scale(1.12)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: wash,
          pointerEvents: 'none',
        }}
      />
      <img
        src={src}
        alt={alt}
        draggable={draggable}
        loading={loading}
        onError={onError}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  );
}
