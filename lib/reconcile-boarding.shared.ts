export type ReconcileClass = 'ORPHAN' | 'NO_TRIPCOUNT' | 'NO_STAMP' | 'OK';

export function classifyBoardingMember(input: {
  hasStampOnReal: boolean;
  hasStampOnOrphan: boolean;
  credited: boolean;
}): ReconcileClass {
  if (input.hasStampOnOrphan && !input.hasStampOnReal) return 'ORPHAN';
  if (!input.hasStampOnReal && !input.hasStampOnOrphan) return 'NO_STAMP';
  if (!input.credited) return 'NO_TRIPCOUNT';
  return 'OK';
}

export function collectRosterIds(input: {
  members?: unknown;
  confirmedMembers?: unknown;
  tripNumber?: number | null;
}): string[] {
  const ids = new Set<string>();
  if (Array.isArray(input.members)) {
    for (const id of input.members) ids.add(String(id));
  }
  const confirmed = input.confirmedMembers;
  if (confirmed && typeof confirmed === 'object') {
    const entries = Object.entries(confirmed as Record<string, unknown>);
    for (const [key, value] of entries) {
      if (input.tripNumber != null && Number(key) !== Number(input.tripNumber)) continue;
      if (!Array.isArray(value)) continue;
      for (const id of value) ids.add(String(id));
    }
  }
  return [...ids];
}
