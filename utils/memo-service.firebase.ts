import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';

export async function addMemo(uuid: string, content: string) {
  const db = getFirebaseDb();
  const ref = await addDoc(collection(db, `users/${uuid}/memo`), {
    content,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deleted: false,
  });
  return { id: ref.id };
}

export async function getMemos(uuid: string) {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, `users/${uuid}/memo`));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        content: data.content,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt,
        deleted: data.deleted === true,
      };
    })
    .filter((m) => !m.deleted)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

export async function updateMemo(uuid: string, memoId: string, content: string) {
  const db = getFirebaseDb();
  await updateDoc(doc(db, `users/${uuid}/memo`, memoId), {
    content,
    updatedAt: serverTimestamp(),
  });
}

export async function softDeleteMemo(uuid: string, memoId: string) {
  const db = getFirebaseDb();
  await updateDoc(doc(db, `users/${uuid}/memo`, memoId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}
