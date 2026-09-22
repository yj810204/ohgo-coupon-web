#!/usr/bin/env node
/**
 * 저녁 루틴에서 내일 AI 출조 브리핑을 /tide 물때 추천 카드로 게시한다.
 *
 * 필요 환경변수:
 *   TIDE_BRIEFING_PUBLISH_TOKEN  게시 API 토큰
 *   OHGO_SITE_URL                기본 https://ohgo.codejaka.com
 *
 * 예시:
 *   TIDE_BRIEFING_PUBLISH_TOKEN=... node scripts/publish-tide-briefing.mjs \
 *     --date 2026-09-23 \
 *     --summary "4물이라 조류가 약합니다." \
 *     --rig "1.5~2호 구멍찌 전유동, 수중 G2" \
 *     --operation "만조 전후 입질이 낫습니다."
 *
 *   TIDE_BRIEFING_PUBLISH_TOKEN=... node scripts/publish-tide-briefing.mjs \
 *     --date 2026-09-23 --file ./briefing.md
 *
 * curl:
 *   curl -X PUT "$OHGO_SITE_URL/api/tide/briefing" \
 *     -H "Authorization: Bearer $TIDE_BRIEFING_PUBLISH_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{"date":"2026-09-23","summary":"...","rig":"...","operation":"..."}'
 */
import { readFile } from 'node:fs/promises';

function tomorrowKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + 1);
  return kst.toISOString().slice(0, 10);
}

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const token = process.env.TIDE_BRIEFING_PUBLISH_TOKEN?.trim() ?? '';
const base = (process.env.OHGO_SITE_URL || 'https://ohgo.codejaka.com').replace(/\/$/, '');
const date = arg('date', tomorrowKst());
const file = arg('file');

if (!token) {
  console.error('TIDE_BRIEFING_PUBLISH_TOKEN 이 필요합니다.');
  process.exit(1);
}

const body = {
  date,
  summary: arg('summary'),
  rig: arg('rig'),
  operation: arg('operation'),
  title: arg('title') || undefined,
  species: arg('species')
    ? arg('species').split(/[,，、/|·]/).map((name) => name.trim()).filter(Boolean)
    : undefined,
};

if (file) {
  body.markdown = await readFile(file, 'utf8');
}

if (hasFlag('dry-run')) {
  console.log(JSON.stringify({ url: `${base}/api/tide/briefing`, body }, null, 2));
  process.exit(0);
}

const res = await fetch(`${base}/api/tide/briefing`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const payload = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(res.status, payload);
  process.exit(1);
}
console.log(JSON.stringify(payload, null, 2));
