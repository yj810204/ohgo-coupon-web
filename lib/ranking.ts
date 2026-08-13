import { collection, getDocsFromServer, orderBy, query } from 'firebase/firestore';
import { DATA_SOURCE, isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { resolveFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import * as supa from './ranking.supabase';
import * as fb from './ranking.firebase';
import type { RankingUser } from './ranking.shared';

export {
  RANKING_FONT,
  maskName,
  formatTournamentPeriod,
} from './ranking.shared';

export type { RankingUser, TournamentInfo, GroupedFishCatch } from './ranking.shared';

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

export const fetchTournament: typeof supa.fetchTournament = (...a) =>
  impl.fetchTournament(...a);
export const fetchMedalCount: typeof supa.fetchMedalCount = (...a) =>
  impl.fetchMedalCount(...a);

export const fetchRankingUsers: typeof supa.fetchRankingUsers = async (currentUserId) => {
  if (!isFirebaseDataSource()) return supa.fetchRankingUsers(currentUserId);

  const mappedId = currentUserId ? await resolveFirestoreUserId(currentUserId) : null;
  const db = getFirebaseDb();
  const snap = await getDocsFromServer(
    query(collection(db, 'users'), orderBy('totalPoint', 'desc'))
  );
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
  const idForMe = mappedId || currentUserId;
  const myIdx = idForMe ? filtered.findIndex((u) => u.id === idForMe) : -1;
  return { users: filtered, myRank: myIdx >= 0 ? myIdx + 1 : null };
};

export const fetchUserFishRecords: typeof supa.fetchUserFishRecords = (...a) =>
  impl.fetchUserFishRecords(...a);
export const fetchUserDisplayName: typeof supa.fetchUserDisplayName = (...a) =>
  impl.fetchUserDisplayName(...a);
