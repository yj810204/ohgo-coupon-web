import { NextRequest, NextResponse } from 'next/server';
import { buildReconcileReport } from '@/lib/reconcile-boarding';
import { getTodayDate } from '@/lib/kst-date';

function readSecret(request: NextRequest): string | null {
  return (
    request.headers.get('x-reconcile-secret') ||
    request.headers.get('x-ohgo-reconcile-secret') ||
    null
  );
}

function parseTrip(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: NextRequest) {
  const configured = process.env.RECONCILE_SECRET?.trim();
  if (!configured) {
    return NextResponse.json(
      { ok: false, error: 'RECONCILE_SECRET 환경 변수가 없습니다. 설정 전까지 이 API는 거부합니다.' },
      { status: 503 }
    );
  }

  const provided = readSecret(request);
  if (!provided || provided !== configured) {
    return NextResponse.json({ ok: false, error: '인증에 실패했습니다.' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const date =
    typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : getTodayDate();
  const tripNumber = parseTrip(body.tripNumber ?? body.trip);
  const apply = body.apply === true || body.mode === 'apply';

  try {
    const report = await buildReconcileReport({
      date,
      tripNumber,
      apply,
    });
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : '대사에 실패했습니다.';
    console.error('reconcile-boarding:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
