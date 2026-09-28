import assert from 'node:assert/strict';
import {
  baitAwardedField,
  couponAwardedField,
  planQrTripCredit,
  isQrTripAlreadyCredited,
} from './credit-trip-bait.ts';
import { stampBusinessDate } from '@/lib/kst-instant';

const stampId = 'stamp-abc';
assert.equal(couponAwardedField(stampId), 'couponAwardedFor_stamp-abc');
assert.equal(baitAwardedField(stampId), 'baitAwardedFor_stamp-abc');

const first = planQrTripCredit({}, stampId);
assert.equal(first.alreadyCredited, false);
assert.equal(first.tripDelta, 0);
assert.equal(first.baitDelta, 1);
assert.equal(first.marker, 'baitAwardedFor_stamp-abc');

const already = { [first.marker]: true };
const second = planQrTripCredit(already, stampId);
assert.equal(second.alreadyCredited, true);
assert.equal(second.tripDelta, 0);
assert.equal(second.baitDelta, 0);

const legacy = planQrTripCredit({ [couponAwardedField(stampId)]: true }, stampId);
assert.equal(legacy.alreadyCredited, true);
assert.equal(legacy.baitDelta, 0);

assert.equal(isQrTripAlreadyCredited({ [couponAwardedField(stampId)]: true }, stampId), true);
assert.equal(isQrTripAlreadyCredited(already, stampId), false);
assert.equal(isQrTripAlreadyCredited({ [first.marker]: false }, stampId), false);
assert.equal(isQrTripAlreadyCredited({}, stampId), false);

const earlyKst = new Date('2026-09-27T21:06:00.000Z');
assert.equal(stampBusinessDate({ timestamp: earlyKst, date: '2026-09-27' }), '2026-09-28');
assert.equal(stampBusinessDate({ date: '2026-09-28' }), '2026-09-28');

console.log('credit-trip-bait tests passed');
