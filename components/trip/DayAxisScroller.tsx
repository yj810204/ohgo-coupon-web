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

export function todayOutingFraction(date: string, startHour: number, endHour: number): number | undefined {
  if (date !== tripDateToStr()) return undefined;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const hour = (Number.isFinite(pick('hour')) ? pick('hour') % 24 : 0) + (Number.isFinite(pick('minute')) ? pick('minute') : 0) / 60;
  if (hour < startHour || hour > endHour) return undefined;
  const span = endHour - startHour;
  return span <= 0 ? undefined : (hour - startHour) / span;
}

export default function DayAxisScroller({
  date,
  onDateChange,
  focusFraction,
  children,
}: {
  date: string;
  onDateChange: (date: string) => void;
  /** 오늘 시각을 화면 가운데에 둘 때 하루 안의 0–1 위치. */
  focusFraction?: number;
  children: (date: string) => ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const ignoreScroll = useRef(false);
  const alignedDate = useRef<string | null>(null);
  const shiftDays = useRef(0);
  const growing = useRef(false);
  const [dates, setDates] = useState(() => datesAround(date, RADIUS));

  useLayoutEffect(() => {
    if (dates.includes(date)) return;
    setDates(datesAround(date, RADIUS));
  }, [date, dates]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const suppressScroll = () => {
      ignoreScroll.current = true;
      requestAnimationFrame(() => {
        ignoreScroll.current = false;
      });
    };
    if (shiftDays.current !== 0) {
      suppressScroll();
      scroller.scrollLeft += shiftDays.current * scroller.clientWidth;
      shiftDays.current = 0;
      growing.current = false;
      return;
    }
    growing.current = false;
    // 스와이프로 이미 맞춘 날짜면 로드 후 스크롤을 다시 잡아 화면이 깜빡이지 않게 한다.
    if (alignedDate.current === date) return;
    const index = dates.indexOf(date);
    if (index < 0) return;
    const width = scroller.clientWidth;
    if (width <= 0) return;
    const fraction = focusFraction ?? 0;
    const target = Math.max(0, index * width + fraction * width - (fraction > 0 ? width / 2 : 0));
    if (Math.abs(scroller.scrollLeft - target) < 2) {
      alignedDate.current = date;
      return;
    }
    suppressScroll();
    scroller.scrollLeft = target;
    alignedDate.current = date;
  }, [date, dates, focusFraction]);

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

  return (
    <div
      ref={scrollerRef}
      onScroll={() => {
        const scroller = scrollerRef.current;
        if (!scroller || scroller.clientWidth <= 0) return;
        if (ignoreScroll.current) return;
        const width = scroller.clientWidth;
        const center = scroller.scrollLeft + width / 2;
        const index = Math.min(dates.length - 1, Math.max(0, Math.floor(center / width)));
        const next = dates[index];
        if (next && next !== date) {
          alignedDate.current = next;
          onDateChange(next);
        }
        if (index <= 1) grow('start');
        if (index >= dates.length - 2) grow('end');
      }}
      style={{
        display: 'flex',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {dates.map((day) => (
        <div key={day} style={{ flex: '0 0 100%', width: '100%', minWidth: 0 }}>
          {children(day)}
        </div>
      ))}
    </div>
  );
}
