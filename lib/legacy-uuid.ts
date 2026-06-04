import { v5 as uuidv5 } from 'uuid';

/** 고정 네임스페이스 — 절대 변경 금지 (Firebase·게스트·병합 공통) */
export const UUID_NAMESPACE = '7b6a5c20-7aef-11ee-b962-0242ac120002';

export function normalizeDob(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{6}$/.test(trimmed)) {
    const year = parseInt(trimmed.slice(0, 2), 10);
    const fullYear = year >= 50 ? 1900 + year : 2000 + year;
    return `${fullYear}${trimmed.slice(2)}`;
  }
  if (/^\d{8}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function computeLegacyUuid(name: string, dob: string): string {
  const normalizedDob = normalizeDob(dob);
  if (!normalizedDob) {
    throw new Error('생년월일 형식이 잘못되었습니다.');
  }
  return uuidv5(`${name.trim()}-${normalizedDob}`, UUID_NAMESPACE);
}
