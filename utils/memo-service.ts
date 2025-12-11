import {
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    updateDoc,
    doc,
    serverTimestamp,
    deleteDoc,
  } from 'firebase/firestore';
  import { db } from '@/lib/firebase';
  
  export async function addMemo(uuid: string, content: string) {
    const ref = collection(db, `users/${uuid}/memo`);
    return await addDoc(ref, {
      content,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deleted: false,
    });
  }
  
  export async function getMemos(uuid: string) {
    const q = query(collection(db, `users/${uuid}/memo`), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as { content: string; createdAt: any; updatedAt: any; deleted: boolean }) }))
      .filter(m => !m.deleted);
  }
  
  export async function updateMemo(uuid: string, memoId: string, content: string) {
    const ref = doc(db, `users/${uuid}/memo`, memoId);
    await updateDoc(ref, {
      content,
      updatedAt: serverTimestamp(),
    });
  }
  
  export async function softDeleteMemo(uuid: string, memoId: string) {
    const ref = doc(db, `users/${uuid}/memo`, memoId);
    await updateDoc(ref, {
      deleted: true,
      updatedAt: serverTimestamp(),
    });
  }

