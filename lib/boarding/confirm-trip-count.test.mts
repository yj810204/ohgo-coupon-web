import assert from 'node:assert/strict';
import { planConfirmedTripCredit } from './confirm-trip-count.shared.ts';

const date = '2026-09-28';
const tripNumber = 1;
const stampId = 'stamp-1';

const first = planConfirmedTripCredit({
  userData: {},
  date,
  tripNumber,
  todayStampIds: [stampId],
});
assert.equal(first.action, 'increment');
assert.equal(first.marker, 'tripCredited_2026-09-28_1');

const again = planConfirmedTripCredit({
  userData: { [first.marker]: true },
  date,
  tripNumber,
  todayStampIds: [stampId],
});
assert.equal(again.action, 'skip');

const legacy = planConfirmedTripCredit({
  userData: { [`couponAwardedFor_${stampId}`]: true },
  date,
  tripNumber,
  todayStampIds: [stampId],
});
assert.equal(legacy.action, 'mark-only');

const legacyOtherHop = planConfirmedTripCredit({
  userData: {},
  date,
  tripNumber,
  todayStampIds: [],
  legacyAlreadyCounted: true,
});
assert.equal(legacyOtherHop.action, 'mark-only');

const missing = planConfirmedTripCredit({
  userData: null,
  date,
  tripNumber,
  todayStampIds: [],
});
assert.equal(missing.action, 'skip');

console.log('confirm-trip-count tests passed');
