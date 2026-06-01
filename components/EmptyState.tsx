'use client';

import type { CSSProperties } from 'react';
import type { IconType } from 'react-icons';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";

export type EmptyStateProps = {
  icon: IconType;
  message: string;
  subtitle?: string;
  /** 카드 안 짧은 안내(출조 일정 없음 등) */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
};

export default function EmptyState({
  icon: Icon,
  message,
  subtitle,
  compact = false,
  className = '',
  style,
}: EmptyStateProps) {
  const circleSize = compact ? 56 : 64;
  const iconSize = compact ? 28 : 32;

  return (
    <div
      className={`text-center ${compact ? 'py-4' : 'py-5'} ${className}`.trim()}
      style={style}
    >
      <div
        className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
        style={{ width: circleSize, height: circleSize, backgroundColor: '#F2F3F5' }}
      >
        <Icon size={iconSize} color="#6F767E" />
      </div>
      <p
        className={subtitle ? 'mb-1' : 'mb-0'}
        style={{
          color: '#6F767E',
          fontFamily: FONT,
          fontWeight: subtitle || !compact ? 600 : 500,
          fontSize: compact ? 14 : 15,
        }}
      >
        {message}
      </p>
      {subtitle ? (
        <p className="mb-0" style={{ color: '#ABABAB', fontFamily: FONT, fontSize: 13 }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
