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

/**
 * 구앱이 이름 뒤 공백을 그대로 넣고 uuidv5 한 경우.
 * `computeLegacyUuid("이종산", …)` ≠ `uuidv5("이종산 -19641018")`.
 */
export function computeLegacyUuidWithTrailingSpace(name: string, dob: string): string {
  const normalizedDob = normalizeDob(dob);
  if (!normalizedDob) {
    throw new Error('생년월일 형식이 잘못되었습니다.');
  }
  return uuidv5(`${name.trim()} -${normalizedDob}`, UUID_NAMESPACE);
}

/** 이름+생년월일로 만들 수 있는 Firestore 문서 id 후보 (중복 제거, trimmed 우선). */
export function listLegacyUuidCandidates(name: string, dob: string): string[] {
  const trimmed = computeLegacyUuid(name, dob);
  const trailing = computeLegacyUuidWithTrailingSpace(name, dob);
  return trimmed === trailing ? [trimmed] : [trimmed, trailing];
}
