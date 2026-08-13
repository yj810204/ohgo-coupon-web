import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import type { GroupedFishCatch, RankingUser, TournamentInfo } from './ranking.shared';

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') {
      const d = fn.call(value);
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function fetchTournament(): Promise<TournamentInfo> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'gameSettings', 'tournament'));
  if (!snap.exists()) return null;
  const data = snap.data();
  const startDate = toDate(data.startDate);
  const endDate = toDate(data.endDate);
  if (!data.title || !startDate || !endDate) return null;
  return {
    title: String(data.title),
    description: data.description ? String(data.description) : '',
    startDate,
    endDate,
  };
}

export async function fetchMedalCount(): Promise<number> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'gameSettings', 'fishing'));
  if (!snap.exists()) return 3;
  const count = Number(snap.data().rankingMedalCount);
  return Number.isFinite(count) && count > 0 ? count : 3;
}

/** 구앱과 동일: users.totalPoint 내림차순 */
export async function fetchRankingUsers(currentUserId?: string) {
  const db = getFirebaseDb();
  const snap = await getDocs(query(collection(db, 'users'), orderBy('totalPoint', 'desc')));
  const all: RankingUser[] = [];
  snap.forEach((d) => {
    const data = d.data();
    all.push({
      id: d.id,
      name: (data.name as string) || '이름 없음',
      totalPoint: Number(data.totalPoint) || 0,
    });
  });
  const filtered = all.filter((u) => u.totalPoint > 0);
  const myIdx = currentUserId ? filtered.findIndex((u) => u.id === currentUserId) : -1;
  return { users: filtered, myRank: myIdx >= 0 ? myIdx + 1 : null };
}

/** 구앱과 동일: users/{id}/points 를 fishName 기준으로 합산 */
export async function fetchUserFishRecords(userId: string): Promise<GroupedFishCatch[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, 'users', userId, 'points'), orderBy('at', 'desc')),
  );
  const fishMap: Record<string, GroupedFishCatch> = {};
  snap.forEach((d) => {
    const data = d.data();
    const fishName =
      (data.fishName as string) ||
      (data.gameType as string) ||
      (data.reason as string) ||
      '이름 없음';
    const point = Number(data.point ?? data.amount) || 0;
    if (!fishMap[fishName]) {
      fishMap[fishName] = { fishName, totalPoints: 0, count: 0 };
    }
    fishMap[fishName].totalPoints += point;
    fishMap[fishName].count += 1;
  });
  return Object.values(fishMap).sort((a, b) => b.totalPoints - a.totalPoints);
}

export async function fetchUserDisplayName(userId: string): Promise<string> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return '이름 없음';
  return (snap.data().name as string) || '이름 없음';
}
