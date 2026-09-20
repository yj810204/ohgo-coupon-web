/** 앞뒤 공백 제거, 이름 안 연속 공백은 한 칸 */
export function normalizePersonName(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function personIdentityKey(name: string, dob: string): string {
  const digits = String(dob ?? '').replace(/\D/g, '');
  return `${normalizePersonName(name)}|${digits}`;
}

export function nameHasOddWhitespace(name: string): boolean {
  const raw = String(name ?? '');
  return raw !== raw.trim() || /\s{2,}/.test(raw);
}

export function displayNameWithVisibleSpaces(name: string): string {
  return String(name ?? '').replace(/ /g, '·');
}

export function describeNameWhitespace(name: string): string | null {
  const raw = String(name ?? '');
  const parts: string[] = [];
  const lead = raw !== raw.trimStart();
  const trail = raw !== raw.trimEnd();
  if (lead && trail) parts.push('이름 앞뒤 공백');
  else if (lead) parts.push('이름 앞 공백');
  else if (trail) parts.push('이름 뒤 공백');
  if (/\s{2,}/.test(raw)) parts.push('이름 연속 공백');
  return parts.length ? parts.join(', ') : null;
}

export function describeDuplicateReason(
  selfName: string,
  selfDob: string,
  otherName: string,
  otherDob: string
): string {
  const reasons = ['같은 이름·생년월일'];
  const ws = describeNameWhitespace(selfName);
  if (ws) reasons.push(ws);
  else if (normalizePersonName(selfName) === normalizePersonName(otherName) && selfName !== otherName) {
    reasons.push('이름 공백이 다름');
  }
  const selfDigits = String(selfDob ?? '').replace(/\D/g, '');
  const otherDigits = String(otherDob ?? '').replace(/\D/g, '');
  if (selfDigits && selfDigits === otherDigits && String(selfDob) !== String(otherDob)) {
    reasons.push('생년월일 표기만 다름');
  }
  return reasons.join(' · ');
}
