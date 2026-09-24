'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { tripDateToStr } from '@/utils/trip-guide-service';

const RADIUS = 3;
const EDGE_LIMIT = 21;

export function addCalendarDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return tripDateToStr(date);
}

function datesAround(date: string, radius: number): string[] {
  return Array.from({ length: radius * 2 + 1 }, (_, index) => addCalendarDays(date, index - radius));
}

export default function DayAxisScroller({
  date,
  onDateChange,
  children,
}: {
  date: string;
  onDateChange: (date: string) => void;
  children: (date: string) => ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fromScroll = useRef(false);
  const shiftDays = useRef(0);
  const growing = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const [dates, setDates] = useState(() => datesAround(date, RADIUS));

  useLayoutEffect(() => {
    if (dates.includes(date)) return;
    setDates(datesAround(date, RADIUS));
  }, [date, dates]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (shiftDays.current !== 0) {
      scroller.scrollLeft += shiftDays.current * scroller.clientWidth;
      shiftDays.current = 0;
      growing.current = false;
      return;
    }
    growing.current = false;
    if (fromScroll.current) {
      fromScroll.current = false;
      return;
    }
    const index = dates.indexOf(date);
    if (index < 0) return;
    const width = scroller.clientWidth;
    if (width <= 0) return;
    const target = index * width;
    if (Math.abs(scroller.scrollLeft - target) < 2) return;
    scroller.scrollLeft = target;
  }, [date, dates]);

  const grow = (edge: 'start' | 'end') => {
    if (growing.current) return;
    growing.current = true;
    setDates((current) => {
      const origin = current[Math.floor(current.length / 2)] ?? date;
      if (edge === 'start') {
        if (current[0] <= addCalendarDays(origin, -EDGE_LIMIT)) {
          growing.current = false;
          return current;
        }
        shiftDays.current += 1;
        return [addCalendarDays(current[0], -1), ...current];
      }
      const last = current[current.length - 1];
      if (last >= addCalendarDays(origin, EDGE_LIMIT)) {
        growing.current = false;
        return current;
      }
      return [...current, addCalendarDays(last, 1)];
    });
  };

  const publishSettledDate = () => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth <= 0) return;
    const width = scroller.clientWidth;
    const index = Math.min(dates.length - 1, Math.max(0, Math.round(scroller.scrollLeft / width)));
    const next = dates[index];
    if (index <= 1) grow('start');
    if (index >= dates.length - 2) grow('end');
    if (!next || next === date) return;
    fromScroll.current = true;
    onDateChange(next);
  };

  return (
    <div
      ref={scrollerRef}
      onScroll={() => {
        if (settleTimer.current) window.clearTimeout(settleTimer.current);
        settleTimer.current = window.setTimeout(publishSettledDate, 140);
      }}
      onScrollEnd={() => {
        if (settleTimer.current) window.clearTimeout(settleTimer.current);
        publishSettledDate();
      }}
      style={{
        display: 'flex',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x pan-y',
        overscrollBehaviorX: 'contain',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {dates.map((day) => (
        <div
          key={day}
          style={{
            flex: '0 0 100%',
            width: '100%',
            minWidth: 0,
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
          }}
        >
          {children(day)}
        </div>
      ))}
    </div>
  );
}
