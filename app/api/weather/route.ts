import { NextResponse } from 'next/server';
import { getOpenMeteoWind, OPEN_METEO_CACHE_TTL_SEC } from '@/lib/open-meteo-wind';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control':
        status === 200
          ? `public, s-maxage=${OPEN_METEO_CACHE_TTL_SEC}, stale-while-revalidate=1800`
          : 'no-store',
    },
  });
}

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!DATE_RE.test(date)) {
    return json({ ok: false, error: '날짜가 올바르지 않습니다.' }, 400);
  }

  try {
    const payload = await getOpenMeteoWind(date);
    return json(payload);
  } catch (error) {
    console.error('[weather] forecast failed', error instanceof Error ? error.message : 'unknown');
    return json({ ok: false, error: '바람 예보를 불러오지 못했습니다.' });
  }
}
