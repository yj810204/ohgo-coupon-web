import { NextResponse } from 'next/server';
import { normalizeTideRegionId } from '@/lib/dadaepo-tide';
import { getTideForecast } from '@/lib/khoa-tide';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? '';
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: '날짜가 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const payload = await getTideForecast(date, normalizeTideRegionId(searchParams.get('region')));
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[tide] forecast failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: '물때 예보를 불러오지 못했습니다.' }, { status: 502 });
  }
}
