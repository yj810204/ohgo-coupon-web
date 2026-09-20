'use client';

import { useEffect, useRef, useState } from 'react';
import { IoChevronDown } from 'react-icons/io5';
import { OHGO_FONT } from '@/lib/page-styles';

type CategoryChipRowProps = {
  categories: { id: string; label: string }[];
  value: string | 'all';
  onChange: (value: string | 'all') => void;
  accent?: string;
  showAll?: boolean;
  disabled?: boolean;
  collapsible?: boolean;
};

export default function CategoryChipRow({
  categories,
  value,
  onChange,
  accent = '#1B6FF5',
  showAll = true,
  disabled = false,
  collapsible = false,
}: CategoryChipRowProps) {
  const chips = showAll
    ? [{ id: 'all' as const, label: '전체' }, ...categories]
    : categories;
  const rowRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canCollapse, setCanCollapse] = useState(false);

  useEffect(() => {
    if (!collapsible) return;
    const el = rowRef.current;
    if (!el) return;
    const measure = () => {
      setCanCollapse(el.scrollHeight > 34);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [chips, collapsible, expanded]);

  return (
    <div className="d-flex align-items-start gap-1" style={{ marginInline: -2 }}>
      <div
        ref={rowRef}
        className="d-flex flex-wrap align-items-center gap-2 flex-grow-1 min-w-0"
        style={
          collapsible && !expanded
            ? { maxHeight: 32, overflow: 'hidden' }
            : undefined
        }
      >
        {chips.map((item) => {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(item.id)}
              className="btn flex-shrink-0 d-inline-flex align-items-center justify-content-center"
              style={{
                borderRadius: 999,
                border: 'none',
                padding: '0 12px',
                height: 32,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: OHGO_FONT,
                backgroundColor: active ? accent : '#F2F3F5',
                color: active ? '#fff' : '#6F767E',
                opacity: disabled ? 0.6 : 1,
                lineHeight: 1,
                verticalAlign: 'middle',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {collapsible && canCollapse ? (
        <button
          type="button"
          className="btn flex-shrink-0 p-0 d-inline-flex align-items-center justify-content-center"
          aria-expanded={expanded}
          aria-label={expanded ? '카테고리 접기' : '카테고리 더보기'}
          onClick={() => setExpanded((prev) => !prev)}
          style={{
            width: 32,
            height: 32,
            border: 'none',
            borderRadius: 999,
            backgroundColor: 'transparent',
            color: '#6F767E',
            verticalAlign: 'middle',
          }}
        >
          <IoChevronDown
            size={16}
            style={{
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </button>
      ) : null}
    </div>
  );
}
