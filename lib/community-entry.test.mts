import assert from 'node:assert/strict';
import { getHomePathForUser, type AppUser } from './auth-session.ts';
import {
  bottomTabHref,
  shouldLeaveCommunityForLogin,
  userAfterAuthRefresh,
} from './community-entry.ts';

const admin: AppUser = {
  uuid: '11111111-1111-4111-8111-111111111111',
  name: '정영남',
  dob: '19810204',
  isAdmin: true,
};

// 로그인 화면은 관리자를 관리자 홈으로 보낸다. 커뮤니티 탭이 그 화면을 열면 관리자 모드가 된다.
assert.equal(getHomePathForUser(admin), '/admin-main');

// 하단 커뮤니티는 설정 경로가 관리자 화면이어도 회원 커뮤니티로만 간다.
assert.equal(bottomTabHref({ id: 'community', path: '/admin-community' }), '/community');
assert.equal(bottomTabHref({ id: 'community', path: '/community' }), '/community');
assert.equal(bottomTabHref({ id: 'home', path: '/admin-main' }), '/main');
assert.equal(bottomTabHref({ id: 'stamp', path: '/stamp' }), '/stamp');

// 인증 상태가 비어 있어도 기기에 남은 관리자면 커뮤니티에서 로그인으로 나가지 않는다.
assert.equal(
  shouldLeaveCommunityForLogin({
    authReady: true,
    authUserId: null,
    storedUserId: admin.uuid,
  }),
  false,
);
assert.equal(
  shouldLeaveCommunityForLogin({
    authReady: false,
    authUserId: null,
    storedUserId: null,
  }),
  false,
);
assert.equal(
  shouldLeaveCommunityForLogin({
    authReady: true,
    authUserId: null,
    storedUserId: null,
  }),
  true,
);

// 갱신이 비어 있어도 이미 읽은 회원을 버리지 않는다.
assert.equal(userAfterAuthRefresh(null, admin), admin);
assert.equal(userAfterAuthRefresh(admin, null)?.uuid, admin.uuid);
assert.equal(userAfterAuthRefresh(null, null), null);

console.log('community tab tests passed');
