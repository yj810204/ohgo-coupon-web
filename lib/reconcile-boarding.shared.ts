export type ReconcileClass = 'ORPHAN' | 'NO_TRIPCOUNT' | 'NO_STAMP' | 'OK';

export type BoardCheckKind = 'ORPHAN' | 'NO_STAMP' | 'NO_BAIT' | 'NO_TRIP' | 'EXTRA' | 'OK';

export type BoardCheckFlags = {
  onRoster: boolean;
  isCrew: boolean;
  hasStamp: boolean;
  hasOrphanStamp: boolean;
  tripCredited: boolean;
  baitAwarded: boolean;
};

export type CorrectionChoice = {
  addStamp?: boolean;
  grantBait?: boolean;
  creditTrip?: boolean;
  moveOrphan?: boolean;
};

export type PlannedCorrection = {
  addStamp: boolean;
  grantBait: boolean;
  creditTrip: boolean;
  moveOrphan: boolean;
};

/** 크론 보고용. 승선 횟수는 출항 확정에서 올리므로 스탬프 유무만 본다. */
export function classifyBoardingMember(input: {
  hasStampOnReal: boolean;
  hasStampOnOrphan: boolean;
  credited?: boolean;
}): ReconcileClass {
  if (input.hasStampOnOrphan && !input.hasStampOnReal) return 'ORPHAN';
  if (!input.hasStampOnReal && !input.hasStampOnOrphan) return 'NO_STAMP';
  return 'OK';
}

/** 선장 화면용. 한 사람당 가장 급한 한 가지. 세부 체크는 flags 로 본다. */
export function classifyBoardCheck(flags: BoardCheckFlags): BoardCheckKind {
  if (!flags.onRoster && (flags.hasStamp || flags.hasOrphanStamp)) return 'EXTRA';
  if (flags.hasOrphanStamp && !flags.hasStamp) return 'ORPHAN';
  if (flags.onRoster && !flags.isCrew && !flags.hasStamp && !flags.hasOrphanStamp) return 'NO_STAMP';
  if ((flags.hasStamp || flags.hasOrphanStamp) && !flags.baitAwarded) return 'NO_BAIT';
  if (flags.onRoster && !flags.isCrew && !flags.tripCredited) return 'NO_TRIP';
  return 'OK';
}

export function boardCheckKindLabel(kind: BoardCheckKind): string {
  switch (kind) {
    case 'ORPHAN':
      return '병합 계정';
    case 'NO_STAMP':
      return '스탬프 없음';
    case 'NO_BAIT':
      return '미끼 없음';
    case 'NO_TRIP':
      return '승선일수 없음';
    case 'EXTRA':
      return '명단 외';
    default:
      return '정상';
  }
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

/** 출항 확정 명부만. 다음 항차 작업 중인 members 는 넣지 않는다. */
export function collectConfirmedRosterIds(
  confirmedMembers: unknown,
  tripNumber: number
): string[] {
  return collectRosterIds({ confirmedMembers, tripNumber, members: [] });
}

export function listConfirmedTripNumbers(confirmedMembers: unknown): number[] {
  if (!confirmedMembers || typeof confirmedMembers !== 'object') return [];
  return Object.keys(confirmedMembers as Record<string, unknown>)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
}

export function hasConfirmedTrip(confirmedMembers: unknown, tripNumber: number): boolean {
  if (!confirmedMembers || typeof confirmedMembers !== 'object') return false;
  const rec = confirmedMembers as Record<string, unknown>;
  return Array.isArray(rec[String(tripNumber)]) || Array.isArray(rec[tripNumber]);
}

/**
 * 선장이 고른 보정만 실제 쓸 작업으로 좁힌다.
 * 이미 있는 것은 다시 하지 않고, 승선일수는 확정 명부에 있을 때만 올린다.
 */
export function planMemberCorrection(
  flags: BoardCheckFlags,
  choice: CorrectionChoice
): PlannedCorrection {
  const moveOrphan = Boolean(choice.moveOrphan || choice.addStamp) && flags.hasOrphanStamp && !flags.hasStamp;
  const addStamp =
    Boolean(choice.addStamp) && !flags.hasStamp && !moveOrphan && !flags.isCrew;
  const willHaveStamp = flags.hasStamp || addStamp || moveOrphan;
  const grantBait = Boolean(choice.grantBait) && !flags.baitAwarded && willHaveStamp;
  const creditTrip =
    Boolean(choice.creditTrip) && flags.onRoster && !flags.tripCredited && !flags.isCrew;
  return { addStamp, grantBait, creditTrip, moveOrphan };
}

export function correctionStampMarker(date: string, trip: string | number): string {
  return `reconcileStamp_${date}_${trip}`;
}
