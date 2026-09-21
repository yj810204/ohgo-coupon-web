import assert from 'node:assert/strict';
import { getTideLabel, getTideRegion } from './dadaepo-tide.ts';
import { parseKstDateTime } from './tide-forecast.ts';
import {
  floatRig,
  formatTideFactsLine,
  getTideFishAdvice,
  parseTripSpecies,
  recommendedRigFlow,
  resolveAdviceSpecies,
  TIDE_ADVICE_TITLE,
  TIDE_BOT_POINTER,
  TIDE_FISH_GROUND,
} from './tide-fish-recommend.ts';

assert.equal(TIDE_ADVICE_TITLE, '물때 추천');
assert.doesNotMatch(TIDE_ADVICE_TITLE, /AI/);
assert.doesNotMatch(TIDE_FISH_GROUND, /15|20m|수심/);
assert.match(TIDE_BOT_POINTER, /봇 브리핑/);

assert.deepEqual(parseTripSpecies('감성돔, 노래미 / 볼락'), ['감성돔', '노래미', '볼락']);
assert.deepEqual(parseTripSpecies(['참돔 · 광어', '참돔']), ['참돔', '광어']);
assert.deepEqual(parseTripSpecies(''), []);

assert.deepEqual(resolveAdviceSpecies('2026-09-22', ['참돔', '광어']), ['참돔', '광어']);
assert.deepEqual(resolveAdviceSpecies('2026-09-22', []), ['감성돔', '노래미', '볼락']);
assert.deepEqual(resolveAdviceSpecies('2026-01-10', []), ['감성돔', '볼락', '학꽁치']);

const fullRig = floatRig(0.2);
assert.equal(recommendedRigFlow(fullRig), '전유동');
assert.doesNotMatch(fullRig, /막대찌/);
assert.match(fullRig, /구멍찌/);

const halfRig = floatRig(0.45);
assert.equal(recommendedRigFlow(halfRig), '반유동');
assert.match(halfRig, /막대찌/);

const region = getTideRegion('dadaepo');
assert.equal(getTideLabel('2026-09-22'), '4물');

const events = [
  {
    type: 'high' as const,
    time: '05:33',
    heightCm: 95,
    deltaCm: null,
    at: parseKstDateTime('2026-09-22 05:33:00'),
  },
  {
    type: 'low' as const,
    time: '11:48',
    heightCm: 51,
    deltaCm: null,
    at: parseKstDateTime('2026-09-22 11:48:00'),
  },
];

const tripAdvice = getTideFishAdvice('2026-09-22', region, {
  events,
  departureTime: '06:00',
  species: ['참돔', '우럭'],
});
assert.ok(tripAdvice);
assert.deepEqual(tripAdvice.species, ['참돔', '우럭']);
assert.equal(tripAdvice.date, '2026-09-22');
assert.equal(tripAdvice.tideLabel, '4물');
assert.equal(tripAdvice.headline, '4물 · 출항 06:00');
assert.deepEqual(tripAdvice.tips, []);
assert.equal(recommendedRigFlow(tripAdvice.rig), '전유동');
assert.doesNotMatch(tripAdvice.rig, /막대찌/);
assert.doesNotMatch(JSON.stringify(tripAdvice), /물돌이:|도전해 보세요|오늘은 4물입니다/);
assert.doesNotMatch(JSON.stringify(tripAdvice), /15–20m|15-20m|수심 15/);
assert.ok(tripAdvice.marks?.some((mark) => mark.type === 'high' && mark.time === '05:33'));
assert.ok(tripAdvice.marks?.some((mark) => mark.type === 'low' && mark.time === '11:48'));
assert.equal(typeof tripAdvice.rangeCm, 'number');
assert.match(formatTideFactsLine(tripAdvice), /4물/);
assert.match(formatTideFactsLine(tripAdvice), /만조 05:33/);
assert.match(formatTideFactsLine(tripAdvice), /간조 11:48/);

const seasonalAdvice = getTideFishAdvice('2026-09-22', region, { departureTime: '06:00' });
assert.ok(seasonalAdvice);
assert.deepEqual(seasonalAdvice.species, ['감성돔', '노래미', '볼락']);
assert.deepEqual(seasonalAdvice.tips, []);

const midAdvice = getTideFishAdvice('2026-09-11', region, {
  events: [
    { type: 'high', time: '06:00', heightCm: 120, deltaCm: null, at: parseKstDateTime('2026-09-11 06:00:00') },
    { type: 'low', time: '12:10', heightCm: 30, deltaCm: null, at: parseKstDateTime('2026-09-11 12:10:00') },
  ],
  departureTime: '09:00',
});
assert.ok(midAdvice);
assert.equal(getTideLabel('2026-09-11'), '사리');
assert.equal(recommendedRigFlow(midAdvice.rig), '반유동');
assert.match(midAdvice.rig, /막대찌/);
assert.deepEqual(midAdvice.tips, []);

console.log('tide-fish-recommend tests passed');
