#!/usr/bin/env node
/**
 * 과거 날짜 승선명단 ↔ 스탬프 대사. 기본은 보고만 한다.
 * 프로덕션 Firestore에 직접 쓰지 말고, 배포된 API를 dry-run으로 호출한다.
 *
 *   RECONCILE_SECRET=... node scripts/backfill-reconcile-boarding.mjs
 *   RECONCILE_SECRET=... node scripts/backfill-reconcile-boarding.mjs --from 2026-09-20 --to 2026-09-28
 *   RECONCILE_SECRET=... node scripts/backfill-reconcile-boarding.mjs --apply   # 명시할 때만 적용
 *
 * --apply 는 기본값이 아니다. 프로덕션에서 실행하지 말 것.
 */

const args = process.argv.slice(2);
function flagValue(name, fallback = '') {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const apply = args.includes('--apply');
const from = flagValue('--from', '2026-09-20');
const to = flagValue('--to', '2026-09-28');
const secret = process.env.RECONCILE_SECRET;
const baseUrl = process.env.RECONCILE_URL || 'https://ohgo.codejaka.com/api/admin/reconcile-boarding';

if (!secret) {
  console.error('RECONCILE_SECRET 이 없습니다. 실행하지 않습니다.');
  process.exit(1);
}

if (apply) {
  console.error('적용 모드입니다. 프로덕션에서 돌리지 마세요. 이 스크립트는 호출만 준비하고 종료합니다.');
  console.error('정말 필요하면 RECONCILE_CONFIRM_APPLY=1 을 추가하세요.');
  if (process.env.RECONCILE_CONFIRM_APPLY !== '1') process.exit(2);
}

function eachDate(start, end) {
  const out = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

for (const date of eachDate(from, to)) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-reconcile-secret': secret,
    },
    body: JSON.stringify({ date, apply }),
  });
  const json = await res.json();
  const counts = json.counts || {};
  console.log(
    date,
    res.status,
    json.mode || (apply ? 'apply' : 'report'),
    `OK=${counts.OK ?? '-'}`,
    `NO_STAMP=${counts.NO_STAMP ?? '-'}`,
    `NO_TRIPCOUNT=${counts.NO_TRIPCOUNT ?? '-'}`,
    `ORPHAN=${counts.ORPHAN ?? '-'}`
  );
  if (!res.ok) {
    console.error(json);
    process.exit(1);
  }
}
