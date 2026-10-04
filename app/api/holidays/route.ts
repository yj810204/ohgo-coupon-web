import { NextResponse } from 'next/server';
import { getHolidayYear, MAX_HOLIDAY_YEAR, MIN_HOLIDAY_YEAR } from '@/lib/kasi-holidays';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('year') ?? '';
  const year = /^\d{4}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(year) || year < MIN_HOLIDAY_YEAR || year > MAX_HOLIDAY_YEAR) {
    return NextResponse.json({ error: '연도가 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const payload = await getHolidayYear(year);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    });
  } catch (error) {
    console.error('[holidays] failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: '공휴일 정보를 불러오지 못했습니다.' }, { status: 502 });
  }
}
