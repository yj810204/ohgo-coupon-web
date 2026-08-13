// lib/storage.ts
// SecureStore 대체 - localStorage 사용

import { DEV_MOCK_USER, isDevAuthBypass } from '@/lib/dev-auth';

export async function saveUser(user: { name: string; dob: string; uuid: string, isAdmin?: boolean }) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('userInfo', JSON.stringify(user));
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

