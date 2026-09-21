import assert from 'node:assert/strict';
import { getTideLabel, getTideRegion } from './dadaepo-tide.ts';
import { parseKstDateTime } from './tide-forecast.ts';
import {
  buildTideTacticSlots,
  floatRig,
  formatAdviceBriefing,
  formatMulBriefing,
  getTideFishAdvice,
  parseTripSpecies,
  recommendedRigFlow,
  resolveAdviceSpecies,
  TIDE_ADVICE_TITLE,
  TIDE_FISH_GROUND,
} from './tide-fish-recommend.ts';

assert.equal(TIDE_ADVICE_TITLE, '물때 추천 공략');
assert.doesNotMatch(TIDE_FISH_GROUND, /15|20m|수심/);

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

const highAt = parseKstDateTime('2026-09-22 05:33:00');
const lowAt = parseKstDateTime('2026-09-22 11:48:00');
const events = [
  { type: 'high' as const, time: '05:33', heightCm: 95, deltaCm: null, at: highAt },
  { type: 'low' as const, time: '11:48', heightCm: 51, deltaCm: null, at: lowAt },
];

const tripAdvice = getTideFishAdvice('2026-09-22', region, {
  events,
  departureTime: '06:00',
  species: ['참돔', '우럭'],
});
assert.ok(tripAdvice);
assert.deepEqual(tripAdvice.species, ['참돔', '우럭']);
assert.match(tripAdvice.headline, /오늘은 4물입니다/);
assert.match(tripAdvice.headline, /4물은 조류가 약한 편이고/);
assert.match(tripAdvice.headline, /출항 06:00 무렵은 거의 정조에 가깝습니다/);
assert.equal(recommendedRigFlow(tripAdvice.rig), '전유동');
assert.doesNotMatch(tripAdvice.rig, /막대찌/);
assert.doesNotMatch(tripAdvice.headline, /막대찌/);
assert.ok(tripAdvice.tips.some((tip) => tip.includes('전유동 운용을 도전해 보세요')));
assert.ok(tripAdvice.tips.every((tip) => !tip.includes('막대찌')));
assert.doesNotMatch(JSON.stringify(tripAdvice), /15–20m|15-20m|수심 15/);
assert.doesNotMatch(tripAdvice.ground, /수심/);

const briefing = formatAdviceBriefing(tripAdvice);
assert.match(briefing, /\n\n/);
assert.ok(briefing.includes('물돌이:'));
assert.ok(briefing.includes('초물:') || briefing.includes('중조:') || briefing.includes('말물:'));
assert.match(briefing, /\d{2}:\d{2}~\d{2}:\d{2} /);

const seasonalAdvice = getTideFishAdvice('2026-09-22', region, { departureTime: '06:00' });
assert.ok(seasonalAdvice);
assert.deepEqual(seasonalAdvice.species, ['감성돔', '노래미', '볼락']);

const slots = buildTideTacticSlots(events, '2026-09-22');
assert.ok(slots.some((slot) => slot.kind === '물돌이'));
assert.ok(slots.some((slot) => slot.kind === '초물' || slot.kind === '중조' || slot.kind === '말물'));
assert.deepEqual(
  slots.map((slot) => slot.kind).filter((kind) => kind === '물돌이').length >= 2,
  true,
);

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
assert.ok(midAdvice.tips.some((tip) => tip.includes('반유동으로 운용해 보세요')));
assert.ok(!midAdvice.tips.some((tip) => tip.includes('전유동 운용을 도전해 보세요')));

const mul = formatMulBriefing('조금', {
  departureTime: '06:00',
  label: '약함 · 거의 정조',
  phase: '거의 정조',
});
assert.equal(
  mul,
  '오늘은 조금입니다. 조금은 조류가 약한 편이고, 출항 06:00 무렵은 거의 정조에 가깝습니다.',
);
assert.equal(
  formatMulBriefing('사리', {
    departureTime: '05:30',
    label: '강함 · 중조',
    phase: '중조',
  }),
  '오늘은 사리입니다. 사리는 조류가 센 편이고, 출항 05:30 무렵은 중조에 가깝습니다.',
);

console.log('tide-fish-recommend tests passed');
