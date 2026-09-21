import assert from 'node:assert/strict';
import {
  adminDeleteConfirmMessage,
  namesMatchForConfirm,
  removeIdsFromConfirmedMembers,
  removeIdsFromList,
  selfWithdrawConfirmMessage,
  WITHDRAWN_MEMBER_LABEL,
} from './member-purge.shared.ts';
import {
  displayWithdrawnAwareName,
  isWithdrawnMemberLabel,
} from './withdrawn-member.ts';
import { displayMemberName, maskAuthorName } from './mask-member-name.ts';

assert.equal(isWithdrawnMemberLabel('탈퇴한 회원'), true);
assert.equal(isWithdrawnMemberLabel(' 탈퇴한  회원 '), true);
assert.equal(isWithdrawnMemberLabel('김철수'), false);
assert.equal(maskAuthorName('김철수'), '김**');
assert.equal(maskAuthorName(WITHDRAWN_MEMBER_LABEL), WITHDRAWN_MEMBER_LABEL);
assert.equal(displayMemberName(WITHDRAWN_MEMBER_LABEL, false), WITHDRAWN_MEMBER_LABEL);
assert.equal(displayMemberName('김철수', false), '김**');
assert.equal(displayMemberName('김철수', true), '김철수');
assert.equal(
  displayWithdrawnAwareName(WITHDRAWN_MEMBER_LABEL, false, (v) => `${v[0]}**`),
  WITHDRAWN_MEMBER_LABEL
);

assert.equal(namesMatchForConfirm('김 철수', '김철수'), true);
assert.equal(namesMatchForConfirm('김철수', '이철수'), false);
assert.equal(namesMatchForConfirm('', '김철수'), false);

const list = removeIdsFromList(['a', 'b', 'c', 'a'], ['a']);
assert.deepEqual(list.next, ['b', 'c']);
assert.equal(list.changed, true);

const untouched = removeIdsFromList(['a', 'b'], ['z']);
assert.deepEqual(untouched.next, ['a', 'b']);
assert.equal(untouched.changed, false);

const missing = removeIdsFromList(undefined, ['a']);
assert.deepEqual(missing.next, []);
assert.equal(missing.changed, false);

const confirmed = removeIdsFromConfirmedMembers(
  { '1': ['u1', 'u2'], '2': ['u3'] },
  ['u2', 'u3']
);
assert.deepEqual(confirmed.next, { '1': ['u1'], '2': [] });
assert.equal(confirmed.changed, true);

const confirmedSame = removeIdsFromConfirmedMembers({ '1': ['u1'] }, ['gone']);
assert.equal(confirmedSame.changed, false);
assert.deepEqual(confirmedSame.next, { '1': ['u1'] });

assert.match(adminDeleteConfirmMessage('홍길동'), /홍길동/);
assert.match(adminDeleteConfirmMessage('홍길동'), new RegExp(WITHDRAWN_MEMBER_LABEL));
assert.match(adminDeleteConfirmMessage('홍길동'), /스탬프/);
assert.match(selfWithdrawConfirmMessage(), new RegExp(WITHDRAWN_MEMBER_LABEL));
assert.doesNotMatch(adminDeleteConfirmMessage('홍길동'), /게시글을 삭제/);

console.log('member-purge shared tests passed');
