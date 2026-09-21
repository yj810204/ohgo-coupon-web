import { collection, deleteDoc, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { removeIdsFromConfirmedMembers, removeIdsFromList } from '@/lib/member-purge.shared';

const USER_SUBCOLLECTIONS = ['stamps', 'coupons', 'stampHistory', 'logs', 'memo', 'points'] as const;

async function deleteSubcollections(userId: string): Promise<void> {
  const db = getFirebaseDb();
  for (const sub of USER_SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, `users/${userId}/${sub}`));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
  const boardingRef = doc(db, 'users', userId, 'boarding', 'info');
  const boardingSnap = await getDoc(boardingRef);
  if (boardingSnap.exists()) {
    await deleteDoc(boardingRef);
  }
}

async function removeFromAttendance(dropIds: string[]): Promise<void> {
  if (dropIds.length === 0) return;
  const db = getFirebaseDb();
  const attSnap = await getDocs(collection(db, 'attendance'));
  for (const d of attSnap.docs) {
    const data = d.data();
    const members = removeIdsFromList(data.members, dropIds);
    const confirmed = removeIdsFromConfirmedMembers(data.confirmedMembers ?? data.confirmed_members, dropIds);
    if (!members.changed && !confirmed.changed) continue;
    const patch: Record<string, unknown> = {};
    if (members.changed) patch.members = members.next;
    if (confirmed.changed && confirmed.next) patch.confirmedMembers = confirmed.next;
    await updateDoc(d.ref, patch);
  }
}

async function deleteUserDocIfExists(userId: string): Promise<boolean> {
  const db = getFirebaseDb();
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  await deleteSubcollections(userId);
  await deleteDoc(ref);
  return true;
}

/** Firestore 회원 문서·하위 컬렉션·해당 회원 명부 출석만 제거. 공유 출조 문서는 유지. */
export async function purgeFirebaseMemberData(userIds: string[]): Promise<boolean> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return false;

  let deletedAny = false;
  for (const id of unique) {
    try {
      const deleted = await deleteUserDocIfExists(id);
      if (deleted) deletedAny = true;
    } catch (error) {
      console.warn('[member-purge] firebase user delete failed', id, error);
    }
  }

  try {
    await removeFromAttendance(unique);
  } catch (error) {
    console.warn('[member-purge] firebase attendance rewrite failed', error);
  }

  return deletedAny;
}
