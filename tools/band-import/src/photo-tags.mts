import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fetch } from './ohgo-config.mts';

/** 편집 화면에서 고른 승선자. 사진 파일마다 따로 둔다 */
export type PhotoTag = { trip: number; userIds: string[] };
export type PhotoTagMap = Record<string, PhotoTag>;

export type Boarder = { id: string; name: string; canNotify: boolean };
export type BoarderTrip = { trip: number; boarders: Boarder[] };
export type BoarderList = {
  date: string;
  /** confirmed: 출항 확정 명단, roster: 확정 전 승선명부, testers: 명단 없이 테스트 회원만, empty: 아무도 없음 */
  source: 'confirmed' | 'roster' | 'testers' | 'empty';
  trips: BoarderTrip[];
};

/** 날짜 명단과 관계없이 태깅 목록에 항상 넣는다. 앱에서 태그를 확인하는 관리자 */
export const ALWAYS_SELECTABLE_NAMES = ['이영우', '정영남', '오고피씽'] as const;

/** 명단 id로 찾은 사람. crew면 태깅 목록에서 뺀다 */
export type RosterPerson = {
  id: string;
  name: string;
  crew: boolean;
  canNotify: boolean;
};

export type TagClient = {
  select(table: string, query: string): Promise<Record<string, unknown>[]>;
  insert(table: string, row: Record<string, unknown>, optionalColumns?: string[]): Promise<string>;
};

export type TagPublishResult = {
  photos: number;
  notified: string[];
  silent: string[];
  note: string;
};

export const TAGS_FILE = 'photo-tags.json';

export class PhotoTagError extends Error {}

const CREW_ROLES = new Set(['captain', 'sailor', 'admin']);
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map((id) => id.trim());
  return [...new Set(ids)];
}

function confirmedTrips(raw: unknown): { trip: number; ids: string[] }[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const trips: { trip: number; ids: string[] }[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[1-9]\d*$/.test(key)) continue;
    const ids = stringIds(value);
    if (ids.length) trips.push({ trip: Number(key), ids });
  }
  trips.sort((a, b) => a.trip - b.trip);
  return trips;
}

function collectIds(attendance: Record<string, unknown> | null): string[] {
  const ids = stringIds(attendance?.members);
  for (const trip of confirmedTrips(attendance?.confirmed_members)) ids.push(...trip.ids);
  return [...new Set(ids)];
}

/** Firestore attendance 문서(members, confirmedMembers)를 조회용 모양으로 바꾼다. 사람이 없으면 null */
export function attendanceFromFirebase(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  const members = Array.isArray(data.members) ? data.members.map(String) : [];
  const confirmedMembers: Record<string, string[]> = {};
  const confirmed = data.confirmedMembers;
  if (confirmed && typeof confirmed === 'object' && !Array.isArray(confirmed)) {
    for (const [key, value] of Object.entries(confirmed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length) confirmedMembers[key] = value.map(String);
    }
  }
  if (!members.length && !Object.keys(confirmedMembers).length) return null;
  return { members, confirmed_members: confirmedMembers };
}

export function personFromFirebaseUser(id: string, data: Record<string, unknown> | null): RosterPerson | null {
  if (!data) return null;
  const role = textOrNull(data.role);
  const token = textOrNull(data.expoPushToken);
  return {
    id,
    name: textOrNull(data.name) ?? id,
    crew: !!role && CREW_ROLES.has(role),
    canNotify: !!token,
  };
}

/** 확정 회차가 있으면 회차별로, 없으면 승선명부 한 목록으로 승객만 돌려준다 */
export function buildBoarderList(date: string, attendance: Record<string, unknown> | null, people: Map<string, RosterPerson>): BoarderList {
  const confirmed = confirmedTrips(attendance?.confirmed_members);
  const members = stringIds(attendance?.members);
  const source: BoarderList['source'] = confirmed.length ? 'confirmed' : members.length ? 'roster' : 'empty';
  const groups = source === 'confirmed' ? confirmed : source === 'roster' ? [{ trip: 1, ids: members }] : [];
  return {
    date,
    source,
    trips: groups.map((group) => ({
      trip: group.trip,
      boarders: group.ids.flatMap((id) => {
        const person = people.get(id);
        if (!person || person.crew) return [];
        return [{ id: person.id, name: person.name || person.id, canNotify: person.canNotify }];
      }),
    })),
  };
}

/** 이미 탄 사람 뒤에 테스트 회원을 붙인다. 같은 번호나 이름이면 한 번만 둔다 */
export function appendAlwaysBoarders(list: BoarderList, extras: Boarder[]): BoarderList {
  if (!extras.length) return list;
  const base = list.trips.length ? list.trips : [{ trip: 1, boarders: [] }];
  const trips = base.map((trip) => {
    const seen = new Set(trip.boarders.map((boarder) => boarder.id));
    const names = new Set(trip.boarders.map((boarder) => boarder.name));
    const more = extras.filter((boarder) => !seen.has(boarder.id) && !names.has(boarder.name));
    return { ...trip, boarders: [...trip.boarders, ...more] };
  });
  return { ...list, source: list.source === 'empty' ? 'testers' : list.source, trips };
}

/** 관리자로 등록된 테스트 회원만 프로필에서 찾는다 */
export async function loadAlwaysSelectable(client: TagClient): Promise<Boarder[]> {
  const filter = ALWAYS_SELECTABLE_NAMES.map((name) => `"${name}"`).join(',');
  const rows = await client.select('profiles', `select=id,name,expo_push_token&role=eq.admin&name=in.(${filter})`);
  const wanted = new Set<string>(ALWAYS_SELECTABLE_NAMES);
  const found = new Map<string, Boarder>();
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    const name = typeof row.name === 'string' ? row.name : '';
    if (!ID_RE.test(id) || !wanted.has(name) || found.has(name)) continue;
    const token = row.expo_push_token;
    found.set(name, { id, name, canNotify: typeof token === 'string' && token.length > 0 });
  }
  return ALWAYS_SELECTABLE_NAMES.flatMap((name) => {
    const boarder = found.get(name);
    return boarder ? [boarder] : [];
  });
}

export function parsePhotoTag(raw: unknown): PhotoTag {
  const value = (raw ?? {}) as Record<string, unknown>;
  const trip = Number(value.trip ?? 1);
  if (!Number.isInteger(trip) || trip < 1 || trip > 9) throw new PhotoTagError('회차가 잘못되었습니다');
  if (!Array.isArray(value.userIds)) throw new PhotoTagError('태깅할 회원을 확인하세요');
  if (value.userIds.length > 80) throw new PhotoTagError('한 사진에 태그는 80명까지입니다');
  const userIds = [...new Set(value.userIds.map((id) => String(id)))];
  if (userIds.some((id) => !ID_RE.test(id))) throw new PhotoTagError('회원 번호가 잘못되었습니다');
  return { trip, userIds };
}

export function readPhotoTags(outDir: string): PhotoTagMap {
  const path = join(outDir, TAGS_FILE);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const tags: PhotoTagMap = {};
    for (const [file, raw] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(file)) continue;
      try {
        const tag = parsePhotoTag(raw);
        if (tag.userIds.length) tags[file] = tag;
      } catch {
        // 깨진 항목은 건너뛴다
      }
    }
    return tags;
  } catch {
    return {};
  }
}

export function writePhotoTags(outDir: string, tags: PhotoTagMap): void {
  const path = join(outDir, TAGS_FILE);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(tags, null, 2)}\n`);
  renameSync(tmp, path);
}

function inList(column: string, ids: string[]): string {
  const quoted = ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
  return `${column}=in.(${quoted})`;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function assertPhotoDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new PhotoTagError('사진 날짜 형식이 잘못되었습니다');
}

/** 확정 명단 칸이 없는 운영 DB에서는 승선명부만 읽는다 */
async function loadAttendance(client: TagClient, date: string): Promise<Record<string, unknown> | null> {
  try {
    const rows = await client.select('attendance', `select=members,confirmed_members&date=eq.${date}`);
    return rows[0] ?? null;
  } catch (err) {
    if (!/confirmed_members/i.test((err as Error).message)) throw err;
    const rows = await client.select('attendance', `select=members&date=eq.${date}`);
    return rows[0] ?? null;
  }
}

/** 그날 출항 확정 명단, 없으면 선장·선원을 뺀 승선명부 */
export async function loadBoarders(client: TagClient, date: string): Promise<BoarderList> {
  assertPhotoDate(date);
  const attendance = await loadAttendance(client, date);
  const ids = collectIds(attendance);
  const people = new Map<string, RosterPerson>();
  if (ids.length) {
    const profiles = await client.select('profiles', `select=id,name,role,expo_push_token&${inList('id', ids)}`);
    const profileIds = new Set(profiles.map((row) => String(row.id)));
    const tripRole = new Map<string, string>();
    try {
      if (profileIds.size) {
        const boarding = await client.select('boarding_info', `select=user_id,trip_role&${inList('user_id', [...profileIds])}`);
        for (const row of boarding) {
          const role = textOrNull(row.trip_role);
          if (role) tripRole.set(String(row.user_id), role);
        }
      }
    } catch {
      // 직책을 못 읽어도 명단은 보여 준다
    }
    for (const row of profiles) {
      const id = String(row.id);
      const role = textOrNull(row.role);
      const duty = tripRole.get(id) ?? null;
      people.set(id, {
        id,
        name: textOrNull(row.name) ?? id,
        crew: (!!role && CREW_ROLES.has(role)) || (!!duty && CREW_ROLES.has(duty)),
        canNotify: !!textOrNull(row.expo_push_token),
      });
    }
    const guestIds = ids.filter((id) => !profileIds.has(id));
    if (guestIds.length) {
      const guests = await client.select('guest_profiles', `select=id,name,merged_to&${inList('id', guestIds)}`);
      const guestRole = new Map<string, string>();
      try {
        const boarding = await client.select('guest_boarding_info', `select=guest_id,trip_role&${inList('guest_id', guestIds)}`);
        for (const row of boarding) {
          const role = textOrNull(row.trip_role);
          if (role) guestRole.set(String(row.guest_id), role);
        }
      } catch {
        // 손님 직책을 못 읽어도 이름은 보여 준다
      }
      const mergedIds = [...new Set(guests.map((row) => textOrNull(row.merged_to)).filter((id): id is string => !!id))].filter((id) => !people.has(id));
      const merged = new Map<string, Record<string, unknown>>();
      if (mergedIds.length) {
        const rows = await client.select('profiles', `select=id,name,expo_push_token&${inList('id', mergedIds)}`);
        for (const row of rows) merged.set(String(row.id), row);
      }
      for (const row of guests) {
        const id = String(row.id);
        const duty = guestRole.get(id) ?? null;
        const mergedTo = textOrNull(row.merged_to);
        const account = mergedTo ? merged.get(mergedTo) : null;
        const token = textOrNull(account?.expo_push_token) ?? (mergedTo && people.get(mergedTo)?.canNotify ? 'yes' : null);
        people.set(id, {
          id: mergedTo || id,
          name: textOrNull(row.name) ?? textOrNull(account?.name) ?? id,
          crew: !!duty && CREW_ROLES.has(duty),
          canNotify: !!token,
        });
      }
    }
  }
  return buildBoarderList(date, attendance, people);
}

type ResolvedTag = { sourceId: string; userId: string | null; name: string; notifyId: string | null; token: string | null; legacyUuid: string | null };
type AccountHint = { name: string; token: string | null; phone?: string | null; dob?: string | null };

function sameIdentity(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const a = left.replace(/\D/g, '');
  const b = right.replace(/\D/g, '');
  if (a && b) return a === b;
  return left.trim() === right.trim();
}

/** 같은 이름 회원이 여러 명이면 전화번호나 생년월일이 맞는 계정만 고른다 */
function pickAppAccount(rows: Record<string, unknown>[], hint?: AccountHint): Record<string, unknown> | null {
  if (rows.length === 1) return rows[0];
  const byPhone = hint?.phone ? rows.filter((row) => sameIdentity(textOrNull(row.phone), hint.phone ?? null)) : [];
  if (byPhone.length === 1) return byPhone[0];
  const byDob = hint?.dob ? rows.filter((row) => sameIdentity(textOrNull(row.dob), hint.dob ?? null)) : [];
  if (byDob.length === 1) return byDob[0];
  return null;
}

async function resolveTagIds(client: TagClient, ids: string[], extra = new Map<string, AccountHint>()): Promise<Map<string, ResolvedTag>> {
  const resolved = new Map<string, ResolvedTag>();
  if (!ids.length) return resolved;
  const profiles = await client.select('profiles', `select=id,name,legacy_uuid,expo_push_token&${inList('id', ids)}`);
  const found = new Set(profiles.map((row) => String(row.id)));
  for (const row of profiles) {
    const id = String(row.id);
    const token = textOrNull(row.expo_push_token);
    resolved.set(id, { sourceId: id, userId: id, name: textOrNull(row.name) ?? id, notifyId: token ? id : null, token, legacyUuid: textOrNull(row.legacy_uuid) });
  }
  const rest = ids.filter((id) => !found.has(id));
  if (!rest.length) return resolved;
  const guests = await client.select('guest_profiles', `select=id,name,merged_to&${inList('id', rest)}`);
  const mergedIds = [...new Set(guests.map((row) => textOrNull(row.merged_to)).filter((id): id is string => !!id))].filter((id) => !resolved.has(id));
  const merged = new Map<string, Record<string, unknown>>();
  if (mergedIds.length) {
    const rows = await client.select('profiles', `select=id,name,legacy_uuid,expo_push_token&${inList('id', mergedIds)}`);
    for (const row of rows) merged.set(String(row.id), row);
  }
  for (const row of guests) {
    const id = String(row.id);
    const mergedTo = textOrNull(row.merged_to);
    const account = mergedTo ? (merged.get(mergedTo) ?? null) : null;
    const known = mergedTo ? resolved.get(mergedTo) : null;
    const token = textOrNull(account?.expo_push_token) ?? known?.token ?? null;
    resolved.set(id, {
      sourceId: id,
      userId: mergedTo,
      name: textOrNull(row.name) ?? textOrNull(account?.name) ?? known?.name ?? id,
      notifyId: token && mergedTo ? mergedTo : null,
      token: token && mergedTo ? token : null,
      legacyUuid: textOrNull(account?.legacy_uuid) ?? known?.legacyUuid ?? null,
    });
  }
  for (const [id, hint] of extra) {
    const current = resolved.get(id);
    if (!current) {
      resolved.set(id, { sourceId: id, userId: null, name: hint.name, notifyId: hint.token ? id : null, token: hint.token, legacyUuid: null });
      continue;
    }
    if (!current.token && hint.token) {
      current.token = hint.token;
      current.notifyId = current.userId ?? id;
    }
    if (current.name === id && hint.name) current.name = hint.name;
  }
  const unlinked = [...resolved.values()].filter((person) => !person.userId && person.name !== person.sourceId);
  if (unlinked.length) {
    const names = [...new Set(unlinked.map((person) => person.name))];
    const filter = names.map((name) => `"${name.replaceAll('"', '')}"`).join(',');
    let accounts: Record<string, unknown>[] = [];
    try {
      accounts = await client.select('profiles', `select=id,name,phone,dob,legacy_uuid,expo_push_token&name=in.(${filter})`);
    } catch {
      accounts = [];
    }
    for (const person of unlinked) {
      const sameName = accounts.filter((row) => textOrNull(row.name) === person.name);
      const account = pickAppAccount(sameName, extra.get(person.sourceId));
      const id = account ? textOrNull(account.id) : null;
      if (!account || !id || !ID_RE.test(id)) continue;
      person.userId = id;
      person.legacyUuid = textOrNull(account.legacy_uuid);
      person.name = textOrNull(account.name) ?? person.name;
      const profileToken = textOrNull(account.expo_push_token);
      if (profileToken) {
        person.token = profileToken;
        person.notifyId = id;
      } else if (person.token) {
        person.notifyId = id;
      }
    }
  }
  return resolved;
}

async function sendExpo(fetchImpl: Fetch, token: string, date: string, count: number): Promise<boolean> {
  const res = await fetchImpl('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      title: '조황 사진 등록',
      body: `${date} 조황 사진 ${count}장이 등록되었습니다. 내 조황 사진에서 확인해 보세요.`,
      data: { screen: 'my-photos' },
    }),
  });
  if (!res.ok) return false;
  const json = (await res.json().catch(() => null)) as { data?: { status?: string } | { status?: string }[] } | null;
  const data = json?.data;
  const status = Array.isArray(data) ? data[0]?.status : data?.status;
  return status !== 'error';
}

/**
 * 이미 올린 공개 사진 주소로 내 조황 사진을 만들고 회원을 태그한다.
 * 알림은 회원당 한 번이고, 앱이 없는 손님은 태그만 남긴다.
 * 실패해도 조황 게시글은 지우지 않도록 오류를 note에 담는다.
 */
export async function publishPhotoTags(opts: {
  client: TagClient;
  fetchImpl: Fetch;
  captainId: string;
  tripDate: string | null;
  photos: { file: string; url: string }[];
  tags: PhotoTagMap;
  log: (message: string) => void;
  /** Firestore 회원 이름과 푸시 토큰. Supabase에 토큰이 없을 때 쓴다 */
  firebaseUsers?: Map<string, AccountHint>;
  /**
   * 오고피씽 앱이 Firestore에 저장한 토큰.
   * 문자열이거나 null이면 그 값을 쓰고, undefined면 프로필 토큰을 그대로 둔다.
   */
  liveToken?: (userId: string, legacyUuid: string | null) => Promise<string | null | undefined>;
}): Promise<TagPublishResult> {
  const empty: TagPublishResult = { photos: 0, notified: [], silent: [], note: '' };
  const relevant = opts.photos.filter((photo) => opts.tags[photo.file]?.userIds.length);
  if (!relevant.length) return empty;
  if (!opts.tripDate) {
    const note = '사진 날짜가 없어 내 조황 사진 태그는 저장하지 않았습니다.';
    opts.log(note);
    return { ...empty, note };
  }
  try {
    const ids = [...new Set(relevant.flatMap((photo) => opts.tags[photo.file].userIds))];
    const resolved = await resolveTagIds(opts.client, ids, opts.firebaseUsers);
    if (opts.liveToken) {
      for (const person of resolved.values()) {
        if (!person.userId) continue;
        const token = await opts.liveToken(person.userId, person.legacyUuid);
        if (token === undefined) continue;
        person.token = token;
        person.notifyId = token ? person.userId : null;
      }
    }
    const notify = new Map<string, { name: string; token: string; count: number }>();
    const silent = new Set<string>();
    const unregistered = new Set<string>();
    const problems: string[] = [];
    let photos = 0;
    for (const photo of relevant) {
      try {
        const chosen = opts.tags[photo.file].userIds.flatMap((id) => {
          const person = resolved.get(id);
          if (!person) {
            problems.push(`회원 없음: ${id}`);
            return [];
          }
          return [person];
        });
        const unique = new Map<string, ResolvedTag>();
        for (const person of chosen) unique.set(person.userId ?? person.sourceId, person);
        if (!unique.size) continue;
        const photoId = await opts.client.insert('captain_photos', {
          captain_id: opts.captainId,
          image_urls: [photo.url],
          trip_date: opts.tripDate,
        });
        for (const person of unique.values()) {
          await opts.client.insert('captain_photo_tags', {
            photo_id: photoId,
            user_id: person.userId,
            user_name: person.name,
          });
          if (person.notifyId && person.token) {
            const current = notify.get(person.notifyId) ?? { name: person.name, token: person.token, count: 0 };
            current.count += 1;
            notify.set(person.notifyId, current);
          } else if (person.userId) {
            unregistered.add(person.name);
          } else {
            silent.add(person.name);
          }
        }
        photos += 1;
      } catch (err) {
        problems.push(`${photo.file}: ${(err as Error).message}`);
      }
    }
    const notified: string[] = [];
    for (const item of notify.values()) {
      const ok = await sendExpo(opts.fetchImpl, item.token, opts.tripDate, item.count);
      if (ok) notified.push(item.name);
      else {
        silent.add(item.name);
        problems.push(`알림 전송 실패: ${item.name}`);
      }
    }
    const parts: string[] = [];
    if (photos) parts.push(`내 조황 사진 ${photos}장에 태그를 저장했습니다.`);
    if (notified.length) parts.push(`${notified.join(', ')}에게 알림을 보냈습니다.`);
    if (silent.size) parts.push(`앱이 없어 알림을 보내지 않음: ${[...silent].join(', ')}`);
    if (unregistered.size) parts.push(`오고피씽 앱 알림 토큰이 없어 보내지 않음: ${[...unregistered].join(', ')}`);
    if (problems.length) parts.push(problems.join(' / '));
    const note = parts.join(' ');
    if (note) opts.log(note);
    return { photos, notified, silent: [...silent], note };
  } catch (err) {
    const note = `내 조황 사진 태그를 저장하지 못했습니다: ${(err as Error).message}`;
    opts.log(note);
    return { ...empty, note };
  }
}
