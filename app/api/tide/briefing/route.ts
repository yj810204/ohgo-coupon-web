import { NextRequest, NextResponse } from 'next/server';
import { authorizeTideBriefingPublish } from '@/lib/tide-briefing-auth';
import {
  getTideAiBriefing,
  publishTideAiBriefing,
  resolveTideAiBriefingStore,
  TIDE_BRIEFING_DATE_RE,
} from '@/utils/tide-ai-briefing-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!TIDE_BRIEFING_DATE_RE.test(date)) {
    return json({ error: '날짜가 올바르지 않습니다.' }, 400);
  }

  try {
    const briefing = await getTideAiBriefing(date);
    return json({ briefing, store: resolveTideAiBriefingStore() });
  } catch (error) {
    console.error('[tide-briefing] get failed', error instanceof Error ? error.message : error);
    return json({ briefing: null }, 200);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await authorizeTideBriefingPublish(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON 본문이 필요합니다.' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return json({ error: 'JSON 본문이 필요합니다.' }, 400);
  }

  try {
    const briefing = await publishTideAiBriefing(body as { date: string });
    return json({ ok: true, briefing, store: resolveTideAiBriefingStore() });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'INVALID_DATE') return json({ error: '날짜가 올바르지 않습니다.' }, 400);
    if (code === 'EMPTY_BRIEFING') {
      return json({ error: '요약·채비·운용 또는 markdown이 필요합니다.' }, 400);
    }
    console.error('[tide-briefing] publish failed', error instanceof Error ? error.message : error);
    return json({ error: '브리핑을 저장하지 못했습니다.' }, 502);
  }
}

export async function POST(request: NextRequest) {
  return PUT(request);
}
