import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const RANKING_FONT = "'Urbanist', var(--font-urbanist), sans-serif";

export type RankingUser = { id: string; name: string; totalPoint: number };

export type TournamentInfo = {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
} | null;

export type GroupedFishCatch = {
  fishName: string;
  totalPoints: number;
  count: number;
  img?: string;
};

export function maskName(name: string): string {
  if (!name) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

function firestoreToDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatTournamentPeriod(tournament: TournamentInfo): string {
  if (!tournament) return '';
  const fmt = (d: Date) =>
    d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${fmt(tournament.startDate)} ~ ${fmt(tournament.endDate)}`;
}

export async function fetchTournament(): Promise<TournamentInfo> {
  const snap = await getDoc(doc(db, 'gameSettings', 'tournament'));
  if (!snap.exists()) return null;
  const d = snap.data();
  const startDate = firestoreToDate(d.startDate);
  const endDate = firestoreToDate(d.endDate);
  if (!d.title || !startDate || !endDate) return null;
  return {
    title: String(d.title),
    description: d.description ? String(d.description) : '',
    startDate,
    endDate,
  };
}

export async function fetchMedalCount(): Promise<number> {
  try {
    const snap = await getDoc(doc(db, 'gameSettings', 'global'));
    if (snap.exists()) return snap.data().ranking_medal_count ?? 3;
  } catch {
    /* keep default */
  }
  return 3;
}

export async function fetchRankingUsers(currentUserId?: string): Promise<{
  users: RankingUser[];
  myRank: number | null;
}> {
  const run = async () => {
    const q = query(collection(db, 'users'), orderBy('totalPoint', 'desc'));
    const snap = await getDocs(q);
    const all: RankingUser[] = snap.docs.map(d => ({
      id: d.id,
      name: d.data().name || '이름 없음',
      totalPoint: d.data().totalPoint || 0,
    }));
    const filtered = all.filter(u => u.totalPoint > 0);
    const myIdx = currentUserId ? filtered.findIndex(u => u.id === currentUserId) : -1;
    return { users: filtered, myRank: myIdx >= 0 ? myIdx + 1 : null };
  };
  try {
    return await run();
  } catch (first) {
    console.warn('fetchRankingUsers retry:', first);
    return await run();
  }
}

export async function fetchUserFishRecords(userId: string): Promise<GroupedFishCatch[]> {
  const q = query(collection(db, `users/${userId}/points`), orderBy('at', 'desc'));
  const snap = await getDocs(q);
  const fishMap: Record<string, GroupedFishCatch> = {};
  snap.docs.forEach(d => {
    const data = d.data();
    const fn = data.fishName || '이름 없음';
    if (!fishMap[fn]) fishMap[fn] = { fishName: fn, totalPoints: 0, count: 0 };
    fishMap[fn].totalPoints += data.point || 0;
    fishMap[fn].count += 1;
  });
  const fishesSnap = await getDocs(collection(db, 'fishes'));
  fishesSnap.docs.forEach(d => {
    const data = d.data();
    if (data.name && data.img && fishMap[data.name]) fishMap[data.name].img = data.img;
  });
  return Object.values(fishMap).sort((a, b) => b.totalPoints - a.totalPoints);
}

export async function fetchUserDisplayName(userId: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (snap.exists()) return snap.data().name || '이름 없음';
  return '이름 없음';
}
