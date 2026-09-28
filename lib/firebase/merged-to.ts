export const MERGED_TO_MAX_HOPS = 8;

export type MergedToHop = {
  id: string;
  mergedTo: string | null;
};

export type FollowMergedToResult = {
  id: string;
  hops: string[];
  cycle: boolean;
  missing: boolean;
};

/**
 * `mergedTo` 체인을 끝까지 따라간다. 순환이면 더 이상 진행하지 않고
 * 마지막으로 확인된 문서를 반환한다.
 */
export function followMergedToChain(
  startId: string,
  docs: Record<string, { mergedTo?: string | null } | null | undefined>
): FollowMergedToResult {
  const hops: string[] = [];
  const seen = new Set<string>();
  let current = String(startId ?? '').trim();
  if (!current) {
    return { id: '', hops, cycle: false, missing: true };
  }

  for (let i = 0; i < MERGED_TO_MAX_HOPS; i += 1) {
    if (seen.has(current)) {
      return { id: hops[hops.length - 1] ?? current, hops, cycle: true, missing: false };
    }
    seen.add(current);
    hops.push(current);

    if (!(current in docs)) {
      if (hops.length === 1) {
        return { id: current, hops, cycle: false, missing: true };
      }
      hops.pop();
      return { id: hops[hops.length - 1] ?? startId, hops, cycle: false, missing: true };
    }

    const doc = docs[current];
    if (!doc) {
      if (hops.length === 1) {
        return { id: current, hops, cycle: false, missing: true };
      }
      hops.pop();
      return { id: hops[hops.length - 1] ?? startId, hops, cycle: false, missing: true };
    }

    const next = String(doc.mergedTo ?? '').trim();
    if (!next || next === current) {
      return { id: current, hops, cycle: false, missing: false };
    }
    current = next;
  }

  return { id: hops[hops.length - 1] ?? startId, hops, cycle: true, missing: false };
}

export function couponAwardedField(stampId: string): string {
  return `couponAwardedFor_${stampId}`;
}

export function tripCreditedField(date: string, trip: string | number): string {
  return `tripCredited_${date}_${trip}`;
}

export function reconcileLockId(date: string, trip: string | number, realId: string): string {
  return `${date}_${trip}_${realId}`;
}

export function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}
