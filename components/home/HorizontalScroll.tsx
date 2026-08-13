'use client';

import { useEffect, useRef, type ReactNode, type PointerEvent } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * 터치·마우스 드래그 / 휠로 가로 스크롤되는 행.
 * 드래그 중에는 자식 클릭이 발생하지 않도록 막는다.
 */
export default function HorizontalScroll({ children, className, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      el.scrollLeft += delta;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const state = drag.current;
    if (!el || !state || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.startX;
    if (Math.abs(dx) > 4) state.moved = true;
    if (state.moved) {
      el.scrollLeft = state.startScrollLeft - dx;
      el.style.cursor = 'grabbing';
      e.preventDefault();
    }
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const state = drag.current;
    if (!el || !state || state.pointerId !== e.pointerId) return;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    el.style.cursor = 'grab';
    if (state.moved) {
      const blockClick = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        el.removeEventListener('click', blockClick, true);
      };
      el.addEventListener('click', blockClick, true);
      window.setTimeout(() => el.removeEventListener('click', blockClick, true), 0);
    }
    drag.current = null;
  };

  return (
    <div
      ref={ref}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        cursor: 'grab',
        userSelect: 'none',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
