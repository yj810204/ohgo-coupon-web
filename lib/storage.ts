// lib/storage.ts
// SecureStore 대체 - localStorage 사용

import { DEV_MOCK_USER, isDevAuthBypass } from '@/lib/dev-auth';
import { mergeStoredUser, type StoredUser } from '@/lib/stored-user';

export type { StoredUser };

export async function saveUser(user: StoredUser) {
  if (typeof window === 'undefined') return;
  let previous: StoredUser | null = null;
  try {
    const raw = localStorage.getItem('userInfo');
    previous = raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    previous = null;
  }
  localStorage.setItem('userInfo', JSON.stringify(mergeStoredUser(previous, user)));
}

/** 확인된 Firestore 회원 id를 이 로그인 계정에만 묶어 둔다. */
export function persistFirestoreUserId(authUid: string, fbUid: string) {
  if (typeof window === 'undefined' || !authUid || !fbUid) return;
  try {
    const raw = localStorage.getItem('userInfo');
    const previous = raw ? (JSON.parse(raw) as StoredUser) : null;
    if (!previous || previous.uuid !== authUid) return;
    localStorage.setItem('userInfo', JSON.stringify({ ...previous, fbUid }));
  } catch {
    /* 저장 실패는 다음 조회에서 다시 시도한다 */
  }
}

export async function getUser() {
  if (isDevAuthBypass()) {
    return {
      uuid: DEV_MOCK_USER.uuid,
      name: DEV_MOCK_USER.name,
      dob: DEV_MOCK_USER.dob,
      isAdmin: DEV_MOCK_USER.isAdmin,
    };
  }

  if (typeof window !== 'undefined') {
    const value = localStorage.getItem('userInfo');
    return value ? JSON.parse(value) : null;
  }
  return null;
}

export async function clearUser() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('userInfo');
  }
}

export const clearPushHistory = async () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('pushHistory');
  }
};

