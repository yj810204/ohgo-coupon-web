import { collection, getDocs, query, where } from 'firebase/firestore';
import { cachedFetch } from '@/lib/query-cache';
import { getFirebaseDb } from '@/lib/firebase/client';
import type { CrewMember } from './find-captains.shared';

export type { CrewMember };

async function fetchCaptains(): Promise<CrewMember[]> {
  try {
    const db = getFirebaseDb();
    const q = query(collection(db, 'users'), where('role', 'in', ['captain', 'sailor']));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        uuid: d.id,
        name: String(data.name ?? ''),
        dob: data.dob != null ? String(data.dob) : undefined,
        phone: data.phone != null ? String(data.phone) : undefined,
        expoPushToken: data.expoPushToken ?? undefined,
        role: data.role,
      };
    });
  } catch (e) {
    console.error('캡틴/세일러 조회 실패:', e);
    return [];
  }
}

export async function findCaptains(): Promise<CrewMember[]> {
  return cachedFetch('roster:captains', 300_000, fetchCaptains);
}
