/**
 * 승선기록 원장. 한 사람이 한 항차에 탄 것을 문서 하나로 둔다.
 * 문서 ID가 날짜·항차·사람이라 같은 승선은 두 번 생기지 않는다.
 * 이 파일은 Firestore 없이 돌아가야 한다 (스크립트·테스트에서 그대로 import).
 */

export const LEDGER_COLLECTION = 'boardingLedger';
export const LEDGER_TRIPS_COLLECTION = 'boardingLedgerTrips';

export type LedgerSource = 'ROSTER_IMAGE' | 'CONFIRM' | 'TRIP_CREDITED' | 'STAMP' | 'ADMIN';
export type LedgerStatus = 'matched' | 'unmatched' | 'void';
export type LedgerRole = 'passenger' | 'crew';
export type MatchMethod =
  | 'exact'
  | 'roster-name'
  | 'roster-birth'
  | 'name-birth-near'
  | 'birth-only'
  | 'confirm'
  | 'manual'
  | 'none';

export type LedgerEvidence = {
  rosterImageUrl?: string;
  ocrName?: string;
  ocrBirth?: string;
  stampIds?: string[];
};

export type LedgerEntry = {
  id: string;
  date: string;
  tripNumber: number;
  personKey: string;
  userId: string | null;
  name: string;
  birth: string;
  role: LedgerRole;
  status: LedgerStatus;
  sources: LedgerSource[];
  matchMethod: MatchMethod;
  needsReview: boolean;
  evidence: LedgerEvidence;
  voidReason?: string;
  createdBy: string;
  updatedBy?: string;
};

export type LedgerTripSummary = {
  id: string;
  date: string;
  tripNumber: number;
  rosterImageUrl: string;
  ocrStatus: 'ok' | 'failed' | 'none' | 'confirm';
  matched: number;
  unmatched: number;
  crew: number;
  onlyInConfirmed: string[];
  onlyInLedger: string[];
  needsReview: number;
  reviewed: boolean;
  reviewedBy?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeName(name: unknown): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, '');
}

/** 생년월일은 YYMMDD 6자리로 비교한다 (명부는 8자리, 회원 정보는 6·8자리가 섞여 있음). */
export function birthKey(birth: unknown): string {
  const digits = String(birth ?? '').replace(/\D/g, '');
  if (digits.length === 8) return digits.slice(2);
  if (digits.length === 6) return digits;
  return '';
}

export function identityKey(name: unknown, birth: unknown): string {
  return `${normalizeName(name)}|${birthKey(birth)}`;
}

export function guestPersonKey(name: unknown, birth: unknown): string {
  return `guest_${normalizeName(name) || 'noname'}_${birthKey(birth) || 'nobirth'}`;
}

export function ledgerDocId(date: string, tripNumber: number, personKey: string): string {
  return `${date}_${tripNumber}_${personKey}`;
}

export function tripDocId(date: string, tripNumber: number): string {
  return `${date}_${tripNumber}`;
}

export function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value);
}

export function isValidTrip(value: unknown): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 3;
}

/** 원장 개수·통계에 넣는 행. 제외된 행과, 스탬프만 보고 추정해 아직 검토 안 한 행은 뺀다. */
export function isCounted(entry: Pick<LedgerEntry, 'status' | 'sources' | 'needsReview'>): boolean {
  if (entry.status === 'void') return false;
  const stampOnly = entry.sources.length > 0 && entry.sources.every((s) => s === 'STAMP');
  if (stampOnly && entry.needsReview) return false;
  return true;
}

function unionSources(a: LedgerSource[], b: LedgerSource[]): LedgerSource[] {
  const order: LedgerSource[] = ['ROSTER_IMAGE', 'CONFIRM', 'TRIP_CREDITED', 'STAMP', 'ADMIN'];
  const set = new Set([...a, ...b]);
  return order.filter((s) => set.has(s));
}

/**
 * 같은 문서에 새 근거가 들어올 때. 사람이 정한 것(manual, void)은 덮지 않고 근거만 더한다.
 */
export function mergeEntry(existing: LedgerEntry | null | undefined, incoming: LedgerEntry): LedgerEntry {
  if (!existing) return incoming;
  const humanDecided = existing.matchMethod === 'manual' || existing.status === 'void';
  const base = humanDecided ? existing : { ...existing, ...incoming };
  const stampIds = [
    ...new Set([...(existing.evidence.stampIds ?? []), ...(incoming.evidence.stampIds ?? [])]),
  ];
  return {
    ...base,
    id: existing.id,
    userId: base.userId ?? existing.userId ?? incoming.userId,
    name: base.name || existing.name || incoming.name,
    birth: base.birth || existing.birth || incoming.birth,
    sources: unionSources(existing.sources, incoming.sources),
    needsReview: humanDecided ? existing.needsReview : existing.needsReview && incoming.needsReview,
    evidence: {
      ...existing.evidence,
      ...incoming.evidence,
      ...(stampIds.length ? { stampIds } : {}),
    },
    createdBy: existing.createdBy,
  };
}

export type MatchCandidate = { userId: string; name: string; birth: string };

export type MatchIndex = {
  byIdentity: Map<string, string[]>;
  byName: Map<string, MatchCandidate[]>;
  byBirth: Map<string, MatchCandidate[]>;
};

/** candidates 는 우선할 계정이 앞에 오게 정렬해서 넘긴다 (가입일 이른 순 등). */
export function buildMatchIndex(candidates: MatchCandidate[]): MatchIndex {
  const byIdentity = new Map<string, string[]>();
  const byName = new Map<string, MatchCandidate[]>();
  const byBirth = new Map<string, MatchCandidate[]>();
  for (const c of candidates) {
    const name = normalizeName(c.name);
    if (!name) continue;
    const bk = birthKey(c.birth);
    if (bk) {
      const key = `${name}|${bk}`;
      const list = byIdentity.get(key) ?? [];
      if (!list.includes(c.userId)) list.push(c.userId);
      byIdentity.set(key, list);
    }
    const byN = byName.get(name) ?? [];
    if (!byN.some((x) => x.userId === c.userId && birthKey(x.birth) === bk)) byN.push(c);
    byName.set(name, byN);
    if (bk) {
      const byB = byBirth.get(bk) ?? [];
      if (!byB.some((x) => x.userId === c.userId)) byB.push(c);
      byBirth.set(bk, byB);
    }
  }
  return { byIdentity, byName, byBirth };
}

function digitDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1;
  return d;
}

export type MatchResult = { userId: string | null; method: MatchMethod; needsReview: boolean };

/**
 * 명부 한 줄을 회원에 맞춘다.
 * 1) 이름+생년월일 정확히 일치
 * 2) 그 항차 확정 명단 안에서 이름이 하나만 같음 (생년월일 OCR 오인식 대비)
 * 3) 이름을 못 읽었지만 확정 명단 안에서 생년월일이 하나만 같음
 * 4) 이름이 같고 생년월일이 한 자리만 다르거나, 생년월일이 같고 이름이 한 글자만 다른 회원이 하나뿐 (검토 필요)
 * 5) 이름을 못 읽었고 생년월일이 같은 회원이 전체에서 하나뿐 (검토 필요)
 */
export function matchRosterRow(
  row: { name: string; birth: string },
  index: MatchIndex,
  confirmedCandidates: MatchCandidate[] = [],
  resolve: (userId: string) => string = (id) => id
): MatchResult {
  const name = normalizeName(row.name);
  const bk = birthKey(row.birth);
  if (!name && !bk) return { userId: null, method: 'none', needsReview: true };

  if (bk) {
    const exact = index.byIdentity.get(`${name}|${bk}`);
    if (exact?.length) {
      const resolved = [...new Set(exact.map(resolve))];
      return { userId: resolved[0]!, method: 'exact', needsReview: resolved.length > 1 };
    }
  }

  const inRoster = [
    ...new Set(confirmedCandidates.filter((c) => normalizeName(c.name) === name).map((c) => resolve(c.userId))),
  ];
  if (name && inRoster.length === 1) return { userId: inRoster[0]!, method: 'roster-name', needsReview: false };

  if (bk) {
    const byBirth = [
      ...new Set(confirmedCandidates.filter((c) => birthKey(c.birth) === bk).map((c) => resolve(c.userId))),
    ];
    if (byBirth.length === 1) return { userId: byBirth[0]!, method: 'roster-birth', needsReview: false };
  }
  if (!name) {
    const sameBirth = [...new Set((index.byBirth.get(bk) ?? []).map((c) => resolve(c.userId)))];
    if (sameBirth.length === 1) return { userId: sameBirth[0]!, method: 'birth-only', needsReview: true };
    return { userId: null, method: 'none', needsReview: true };
  }

  if (bk) {
    const near = [
      ...new Set([
        ...(index.byName.get(name) ?? [])
          .filter((c) => digitDistance(birthKey(c.birth), bk) <= 1)
          .map((c) => resolve(c.userId)),
        ...(index.byBirth.get(bk) ?? [])
          .filter((c) => digitDistance(normalizeName(c.name), name) === 1)
          .map((c) => resolve(c.userId)),
      ]),
    ];
    if (near.length === 1) return { userId: near[0]!, method: 'name-birth-near', needsReview: true };
  }

  return { userId: null, method: 'none', needsReview: true };
}

export function compareWithConfirmed(
  ledgerUserIds: string[],
  confirmedUserIds: string[]
): { onlyInLedger: string[]; onlyInConfirmed: string[] } {
  const ledger = new Set(ledgerUserIds);
  const confirmed = new Set(confirmedUserIds);
  return {
    onlyInLedger: [...ledger].filter((id) => !confirmed.has(id)),
    onlyInConfirmed: [...confirmed].filter((id) => !ledger.has(id)),
  };
}

/** 회원 한 명의 승선 횟수. 같은 날짜·항차는 한 번만 센다. */
export function countMemberBoardings(entries: LedgerEntry[], userId: string): number {
  const keys = new Set<string>();
  for (const e of entries) {
    if (e.userId !== userId || !isCounted(e)) continue;
    keys.add(tripDocId(e.date, e.tripNumber));
  }
  return keys.size;
}

export type TripCountChange = { userId: string; name: string; from: number; to: number };

export function planTripCountSync(
  entries: LedgerEntry[],
  current: Map<string, { tripCount: number; name: string }>
): TripCountChange[] {
  const counts = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.userId || !isCounted(e)) continue;
    const set = counts.get(e.userId) ?? new Set<string>();
    set.add(tripDocId(e.date, e.tripNumber));
    counts.set(e.userId, set);
  }
  const changes: TripCountChange[] = [];
  const ids = new Set([...counts.keys(), ...current.keys()]);
  for (const userId of ids) {
    const to = counts.get(userId)?.size ?? 0;
    const cur = current.get(userId);
    const from = cur?.tripCount ?? 0;
    if (from !== to) changes.push({ userId, name: cur?.name ?? '', from, to });
  }
  return changes.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
}

/** 계정 병합 때 없어지는 계정의 행을 남는 계정 키로 옮긴 결과. */
export function planMergeMoves(
  fromEntries: LedgerEntry[],
  toUserId: string,
  existingTarget: Map<string, LedgerEntry>
): { remove: string[]; upsert: LedgerEntry[] } {
  const remove: string[] = [];
  const upsert: LedgerEntry[] = [];
  for (const e of fromEntries) {
    const id = ledgerDocId(e.date, e.tripNumber, toUserId);
    const moved: LedgerEntry = { ...e, id, personKey: toUserId, userId: toUserId };
    upsert.push(mergeEntry(existingTarget.get(id), moved));
    if (e.id !== id) remove.push(e.id);
  }
  return { remove, upsert };
}

export type BoardingRange = { startDate: string; endDate: string };

export function isDateInRange(date: string | null | undefined, range: BoardingRange | null): boolean {
  if (!date) return false;
  if (!range) return true;
  return date >= range.startDate && date <= range.endDate;
}

export function validateRange(startDate: string, endDate: string): { range: BoardingRange } | { error: string } {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return { error: '시작일과 종료일을 선택해 주세요.' };
  if (startDate > endDate) return { error: '시작일이 종료일보다 늦습니다.' };
  return { range: { startDate, endDate } };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** today 는 KST 날짜 문자열 (getTodayDate). */
export function presetRange(preset: 'thisMonth' | 'lastMonth' | 'thisYear', today: string): BoardingRange {
  const [y, m] = today.split('-').map(Number) as [number, number];
  if (preset === 'thisYear') return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
  const year = preset === 'lastMonth' && m === 1 ? y - 1 : y;
  const month = preset === 'lastMonth' ? (m === 1 ? 12 : m - 1) : m;
  return {
    startDate: `${year}-${pad(month)}-01`,
    endDate: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
  };
}

export type TripRow = {
  date: string;
  tripNumber: number;
  passengers: number;
  crew: number;
  members: number;
  guests: number;
};

export type MemberRow = { userId: string; name: string; boardings: number; lastDate: string };

export type RangeSummary = {
  trips: TripRow[];
  members: MemberRow[];
  totals: { trips: number; passengers: number; members: number; guests: number };
};

export function summarizeRange(entries: LedgerEntry[], range: BoardingRange | null): RangeSummary {
  const trips = new Map<string, TripRow>();
  const members = new Map<string, { name: string; keys: Set<string>; lastDate: string }>();
  for (const e of entries) {
    if (!isCounted(e) || !isDateInRange(e.date, range)) continue;
    const key = tripDocId(e.date, e.tripNumber);
    const row = trips.get(key) ?? {
      date: e.date,
      tripNumber: e.tripNumber,
      passengers: 0,
      crew: 0,
      members: 0,
      guests: 0,
    };
    if (e.role === 'crew') row.crew += 1;
    else {
      row.passengers += 1;
      if (e.userId) row.members += 1;
      else row.guests += 1;
    }
    trips.set(key, row);

    if (e.userId && e.role !== 'crew') {
      const m = members.get(e.userId) ?? { name: e.name, keys: new Set<string>(), lastDate: '' };
      m.keys.add(key);
      if (e.date > m.lastDate) m.lastDate = e.date;
      if (!m.name) m.name = e.name;
      members.set(e.userId, m);
    }
  }
  const tripRows = [...trips.values()].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.tripNumber - a.tripNumber
  );
  const memberRows = [...members.entries()]
    .map(([userId, m]) => ({ userId, name: m.name, boardings: m.keys.size, lastDate: m.lastDate }))
    .sort((a, b) => b.boardings - a.boardings || a.name.localeCompare(b.name, 'ko'));
  return {
    trips: tripRows,
    members: memberRows,
    totals: {
      trips: tripRows.length,
      passengers: tripRows.reduce((s, t) => s + t.passengers, 0),
      members: memberRows.length,
      guests: tripRows.reduce((s, t) => s + t.guests, 0),
    },
  };
}

export function sourceLabel(source: LedgerSource): string {
  switch (source) {
    case 'ROSTER_IMAGE':
      return '명부 이미지';
    case 'CONFIRM':
      return '출항 확정';
    case 'TRIP_CREDITED':
      return '승선일수 표시';
    case 'STAMP':
      return '스탬프';
    default:
      return '수동';
  }
}

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 엑셀에서 한글이 깨지지 않게 BOM 을 붙인다. */
export function toCsv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
