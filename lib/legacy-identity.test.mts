import assert from 'node:assert/strict';
import { isUnregisteredLegacyIdentity } from './legacy-identity.ts';

assert.equal(
  isUnregisteredLegacyIdentity({ existingProfile: null, guest: null, firebaseUser: null }),
  true,
  '어디에도 없으면 신규 가입'
);
assert.equal(
  isUnregisteredLegacyIdentity({ existingProfile: { id: 'p' }, guest: null, firebaseUser: null }),
  false,
  '연결된 프로필이 있으면 기존 회원'
);
assert.equal(
  isUnregisteredLegacyIdentity({ existingProfile: null, guest: { id: 'g' }, firebaseUser: null }),
  false,
  '선장이 등록한 게스트면 기존 회원'
);
assert.equal(
  isUnregisteredLegacyIdentity({ existingProfile: null, guest: null, firebaseUser: { name: '홍길동' } }),
  false,
  'Firestore 회원이면 기존 회원'
);

console.log('legacy-identity tests passed');
