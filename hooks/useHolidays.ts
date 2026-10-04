'use client';

import { useEffect, useMemo, useState } from 'react';
import { cachedFetch, peekCache } from '@/lib/query-cache';
import {
  fallbackHolidays,
  holidaysToMap,
  type KrHoliday,
  type KrHolidayMap,
  type KrHolidayYearPayload,
} from '@/lib/kr-holidays';

const HOLIDAY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cacheKey(year: number) {
  return `holidays:${year}`;
}

function fetchHolidayYear(year: number): Promise<KrHoliday[]> {
  return cachedFetch(cacheKey(year), HOLIDAY_CACHE_TTL_MS, async () => {
    const res = await fetch(`/api/holidays?year=${year}`);
    if (!res.ok) throw new Error(`holidays ${res.status}`);
    const payload = (await res.json()) as KrHolidayYearPayload;
    return Array.isArray(payload.holidays) ? payload.holidays : [];
  });
}

/** 서버 응답 전에는 번들 fallback 을 먼저 보여준다. */
function initialYear(year: number): KrHoliday[] {
  return peekCache<KrHoliday[]>(cacheKey(year)) ?? fallbackHolidays(year) ?? [];
}

/** 연도별 공휴일을 받아 'YYYY-MM-DD' -> 이름 맵으로 돌려준다. */
export function useHolidays(years: number[]): KrHolidayMap {
  const yearsKey = [...new Set(years.filter((y) => Number.isInteger(y)))].sort().join(',');
  const yearList = useMemo(
    () => (yearsKey ? yearsKey.split(',').map(Number) : []),
    [yearsKey],
  );

  const [byYear, setByYear] = useState<Record<number, KrHoliday[]>>(() => {
    const init: Record<number, KrHoliday[]> = {};
    for (const y of yearList) init[y] = initialYear(y);
    return init;
  });

  useEffect(() => {
    let cancelled = false;
    for (const year of yearList) {
      fetchHolidayYear(year)
        .then((list) => {
          if (cancelled) return;
          setByYear((prev) => ({ ...prev, [year]: list }));
        })
        .catch(() => {
          if (cancelled) return;
          setByYear((prev) => (prev[year] ? prev : { ...prev, [year]: initialYear(year) }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [yearList]);

  return useMemo(() => {
    const all: KrHoliday[] = [];
    for (const y of yearList) all.push(...(byYear[y] ?? initialYear(y)));
    return holidaysToMap(all);
  }, [byYear, yearList]);
}
