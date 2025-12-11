// lib/storage.ts
// SecureStore 대체 - localStorage 사용

export async function saveUser(user: { name: string; dob: string; uuid: string, isAdmin?: boolean }) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('userInfo', JSON.stringify(user));
  }
}

export async function getUser() {
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

