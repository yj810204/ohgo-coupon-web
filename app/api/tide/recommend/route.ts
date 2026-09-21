import { NextResponse } from 'next/server';
import { getTideRegion, normalizeTideRegionId } from '@/lib/dadaepo-tide';
import { getTideForecast } from '@/lib/khoa-tide';
import { getTideFishAdvice, normalizeDepartQuery } from '@/lib/tide-fish-recommend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function jsonAdvice(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? '';
  if (!DATE_RE.test(date)) {
    return jsonAdvice({ error: '날짜가 올바르지 않습니다.' }, 400);
  }

  const regionId = normalizeTideRegionId(searchParams.get('region'));
  const departureTime = normalizeDepartQuery(searchParams.get('depart'));
  let events;
  try {
    const forecast = await getTideForecast(date, regionId);
    events = forecast.events;
  } catch {
    events = undefined;
  }

  const advice = getTideFishAdvice(date, getTideRegion(regionId), { events, departureTime });
  if (!advice) {
    return jsonAdvice({ error: '물때 정보를 찾을 수 없습니다.' }, 404);
  }

  return jsonAdvice(advice);
}
