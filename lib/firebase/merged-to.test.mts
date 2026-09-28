import assert from 'node:assert/strict';
import { followMergedToChain } from './merged-to.ts';
import { computeLegacyUuid, computeLegacyUuidWithTrailingSpace, listLegacyUuidCandidates } from '../legacy-uuid.ts';

const chain = followMergedToChain('a', {
  a: { mergedTo: 'b' },
  b: { mergedTo: 'c' },
  c: { mergedTo: null },
});
assert.equal(chain.id, 'c');
assert.deepEqual(chain.hops, ['a', 'b', 'c']);
assert.equal(chain.cycle, false);
assert.equal(chain.missing, false);

const alreadyReal = followMergedToChain('real', { real: { mergedTo: null } });
assert.equal(alreadyReal.id, 'real');
assert.equal(alreadyReal.cycle, false);

const cycle = followMergedToChain('a', {
  a: { mergedTo: 'b' },
  b: { mergedTo: 'a' },
});
assert.equal(cycle.cycle, true);
assert.equal(cycle.hops.includes('a'), true);
assert.equal(cycle.hops.includes('b'), true);
assert.ok(cycle.hops.length <= 3, '순환이면 무한히 따라가지 않는다');

const self = followMergedToChain('x', { x: { mergedTo: 'x' } });
assert.equal(self.id, 'x');
assert.equal(self.cycle, false);

const missing = followMergedToChain('gone', {});
assert.equal(missing.missing, true);
assert.equal(missing.id, 'gone');

const brokenPointer = followMergedToChain('a', {
  a: { mergedTo: 'missing' },
});
assert.equal(brokenPointer.id, 'a');
assert.equal(brokenPointer.missing, true);

const trimmed = computeLegacyUuid('이종산', '19641018');
const trailing = computeLegacyUuidWithTrailingSpace('이종산', '19641018');
assert.notEqual(trimmed, trailing, '이름 뒤 공백이 있으면 uuid가 달라야 한다');
assert.equal(computeLegacyUuid('이종산 ', '19641018'), trimmed, '입력 이름은 trim 한다');
assert.deepEqual(listLegacyUuidCandidates('이종산', '19641018'), [trimmed, trailing]);

console.log('merged-to / legacy-uuid tests passed');
