import { NextRequest, NextResponse } from 'next/server';
import { applyBoardCorrections, buildBoardCheckReport } from '@/lib/board-check';
import { getTodayDate } from '@/lib/kst-date';
import { applyPendingCookies, requireCaptainOrAdmin, resolveStaffActor } from '@/lib/staff-auth';
import type { CorrectionChoice } from '@/lib/reconcile-boarding.shared';

function parseDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function parseTrip(value: unknown): number | null {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

function jsonWithSession(
  session: { pendingCookies: Parameters<typeof applyPendingCookies>[1] } | null,
  body: unknown,
  status = 200
) {
  const res = NextResponse.json(body, { status });
  if (session) applyPendingCookies(res, session.pendingCookies);
  return res;
}

export async function GET(request: NextRequest) {
  const auth = await requireCaptainOrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  }

  const date = parseDate(request.nextUrl.searchParams.get('date')) ?? getTodayDate();
  const tripNumber = parseTrip(request.nextUrl.searchParams.get('tripNumber') ?? request.nextUrl.searchParams.get('trip')) ?? 1;

  try {
    const report = await buildBoardCheckReport({ date, tripNumber, includeExtras: true });
    return jsonWithSession(auth.session, { ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : '명단 대조에 실패했습니다.';
    console.error('roster-check GET:', error);
    return jsonWithSession(auth.session, { ok: false, error: message }, 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireCaptainOrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const date = parseDate(body.date) ?? getTodayDate();
  const tripNumber = parseTrip(body.tripNumber ?? body.trip);
  if (!tripNumber) {
    return jsonWithSession(auth.session, { ok: false, error: '항차가 올바르지 않습니다.' }, 400);
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: { realId: string; choice: CorrectionChoice }[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const realId = String(rec.realId ?? '').trim();
    if (!realId) continue;
    items.push({
      realId,
      choice: {
        addStamp: rec.addStamp === true,
        grantBait: rec.grantBait === true,
        creditTrip: rec.creditTrip === true,
        moveOrphan: rec.moveOrphan === true,
      },
    });
  }

  if (!items.length) {
    return jsonWithSession(auth.session, { ok: false, error: '보정할 회원을 선택해 주세요.' }, 400);
  }

  try {
    const actor = await resolveStaffActor(auth.userId);
    const result = await applyBoardCorrections({
      date,
      tripNumber,
      actorId: actor.userId,
      actorName: actor.name,
      items,
    });
    const report = await buildBoardCheckReport({ date, tripNumber, includeExtras: true });
    return jsonWithSession(auth.session, { ok: true, ...result, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : '보정에 실패했습니다.';
    console.error('roster-check POST:', error);
    return jsonWithSession(auth.session, { ok: false, error: message }, 500);
  }
}
