import { format } from 'date-fns';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { requireFirestoreUserId, resolveFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import { sendPushToUser } from './send-push';
import { firebaseQrStampWriteFields } from '@/lib/stamps/firebase-qr-stamp';
import { getTodayDate, getTodayRange, parseKstDate } from '@/lib/kst-date';

/** Auth/세션 UUID → Firestore users/{id} */
async function mapUuid(uuid: string): Promise<string> {
  return requireFirestoreUserId(uuid);
}

async function logAction(uuid: string, action: string, detail: string) {
  const db = getFirebaseDb();
  await addDoc(collection(db, `users/${uuid}/logs`), {
    action,
    detail,
    timestamp: Timestamp.now(),
  });
}

export async function getStampHistory({
  uuid,
  startDate,
  endDate,
}: {
  uuid: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const mapped = await resolveFirestoreUserId(uuid);
  if (!mapped) return [];
  uuid = mapped;
  const db = getFirebaseDb();
  const conds: QueryConstraint[] = [orderBy('timestamp', 'desc')];
  if (startDate) conds.push(where('timestamp', '>=', Timestamp.fromDate(startDate)));
  if (endDate) conds.push(where('timestamp', '<=', Timestamp.fromDate(endDate)));
  const snap = await getDocs(query(collection(db, `users/${uuid}/stampHistory`), ...conds));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      action: data.action,
      stampId: data.stampId,
      date: data.date,
      method: data.method,
      message: data.message,
      timestamp: data.timestamp?.toDate?.()?.toISOString?.() ?? data.timestamp,
    };
  });
}

export async function clearStampHistory(uuid: string): Promise<void> {
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, `users/${uuid}/stampHistory`));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function issue50PercentCoupon(uuid: string): Promise<void> {
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, `users/${uuid}/stamps`));
  const stamps = snap.docs.sort((a, b) => {
    const aTs = a.data().timestamp?.seconds ?? a.data().createdAt?.seconds ?? 0;
    const bTs = b.data().timestamp?.seconds ?? b.data().createdAt?.seconds ?? 0;
    return aTs - bTs;
  });

  if (stamps.length < 5) return;

  const toDelete = stamps.slice(0, 5);
  await Promise.all(toDelete.map((d) => deleteDoc(d.ref)));

  await addDoc(collection(db, `users/${uuid}/coupons`), {
    issuedAt: getTodayDate(),
    reason: '5회 적립 50% 할인',
    used: false,
    isHalf: 'Y',
  });

  await logAction(uuid, '쿠폰 발급', '5회 적립 50% 할인 쿠폰 발급');
}

export async function addStamp(uuid: string, method: 'QR' | 'ADMIN' = 'QR'): Promise<void> {
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', uuid);
  const stampRef = collection(db, `users/${uuid}/stamps`);
  const now = Date.now();

  if (method === 'QR') {
    const { start, end } = getTodayRange();
    const couponSnap = await getDocs(
      query(collection(db, `users/${uuid}/coupons`), where('used', '==', true))
    );

    const hasUsedToday = couponSnap.docs.some((d) => {
      const issuedAt = d.data().issuedAt;
      let issuedDate: Date | null = null;
      if (issuedAt instanceof Timestamp) issuedDate = issuedAt.toDate();
      if (typeof issuedAt === 'string') issuedDate = parseKstDate(issuedAt);
      return issuedDate !== null && issuedDate >= start && issuedDate <= end;
    });

    if (hasUsedToday) {
      throw new Error(
        '오늘은 쿠폰 사용으로 QR 스탬프 적립이 제한됩니다.\n추가 적립은 선장님께 문의해주세요.'
      );
    }
  }

  const userSnap = await getDoc(userRef);
  const lastStampTime = userSnap.exists()
    ? (userSnap.data()?.lastStampTime?.toMillis?.() ?? 0)
    : 0;

  const LIMIT_MS = method === 'QR' ? 8 * 60 * 60 * 1000 : 1000;
  if (lastStampTime && now - lastStampTime < LIMIT_MS) {
    const nextAvailable = new Date(lastStampTime + LIMIT_MS);
    const hours = nextAvailable.getHours().toString().padStart(2, '0');
    const minutes = nextAvailable.getMinutes().toString().padStart(2, '0');
    throw new Error(
      `다음 적립은 ${hours}:${minutes} 이후에 가능합니다.\n추가 적립은 선장님께 문의해주세요.`
    );
  }

  const stampData =
    method === 'QR'
      ? firebaseQrStampWriteFields({ date: getTodayDate(), timestamp: new Date() })
      : {
          date: getTodayDate(),
          method,
          timestamp: new Date(),
        };

  const stampDocRef = await addDoc(stampRef, stampData);
  await addDoc(collection(db, `users/${uuid}/stampHistory`), {
    action: 'add',
    stampId: stampDocRef.id,
    date: getTodayDate(),
    method,
    timestamp: Timestamp.now(),
    message: `${method} 방식으로 스탬프 적립`,
  });

  await updateDoc(userRef, { lastStampTime: stampData.timestamp });
  await logAction(uuid, '스탬프 적립', `${method} 방식으로 1개 적립`);

  const snapshotAfter = await getDocs(stampRef);
  if (snapshotAfter.size >= 10) {
    await issueCoupon(uuid);
    await clearStamps(uuid);
    await sendPushToUser({
      uuid,
      title: '쿠폰이 발급되었습니다~! 🎁',
      body: '스탬프 10개 도달! 쿠폰이 발급되었어요~!',
      data: { screen: 'coupons', uuid },
    });
  }
}

export async function addStampBatch(uuid: string, count: number): Promise<void> {
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const stampRef = collection(db, `users/${uuid}/stamps`);
  const userRef = doc(db, 'users', uuid);
  const now = new Date();

  const stampDataList = Array.from({ length: count }, (_, i) => ({
    date: getTodayDate(),
    method: 'ADMIN' as const,
    timestamp: new Date(now.getTime() + i * 1000),
  }));

  for (const data of stampDataList) {
    const stampDocRef = await addDoc(stampRef, data);
    await addDoc(collection(db, `users/${uuid}/stampHistory`), {
      action: 'add',
      stampId: stampDocRef.id,
      date: data.date,
      method: data.method,
      timestamp: Timestamp.now(),
      message: 'ADMIN 방식으로 스탬프 적립',
    });
  }

  await updateDoc(userRef, {
    lastStampTime: stampDataList[count - 1]!.timestamp,
  });
  await logAction(uuid, '스탬프 적립', `ADMIN 방식으로 ${count}개 적립`);

  const allSnap = await getDocs(stampRef);
  const allStamps = allSnap.docs.sort(
    (a, b) => (a.data().timestamp?.seconds ?? 0) - (b.data().timestamp?.seconds ?? 0)
  );
  const fullCouponCount = Math.floor(allStamps.length / 10);

  for (let i = 0; i < fullCouponCount; i++) {
    await issueCoupon(uuid);
    const toDelete = allStamps.splice(0, 10);
    for (const d of toDelete) {
      await addDoc(collection(db, `users/${uuid}/stampHistory`), {
        action: 'remove',
        stampId: d.id,
        date: d.data().date,
        method: d.data().method,
        timestamp: Timestamp.now(),
        message: '쿠폰 발급으로 스탬프 삭제',
      });
      await deleteDoc(d.ref);
    }
  }

  if (fullCouponCount > 0) {
    await sendPushToUser({
      uuid,
      title: '쿠폰이 발급되었습니다~! 🎁',
      body: `스탬프 ${fullCouponCount * 10}개 적립! 쿠폰 ${fullCouponCount}개가 발급되었어요~!`,
      data: { screen: 'coupons', uuid },
    });
  }
}

export async function removeStampBatch(uuid: string, count: number): Promise<void> {
  if (count < 1) return;
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, `users/${uuid}/stamps`));
  const stamps = snap.docs.sort(
    (a, b) => (b.data().timestamp?.seconds ?? 0) - (a.data().timestamp?.seconds ?? 0)
  );

  if (stamps.length < count) {
    throw new Error(`보유 스탬프(${stamps.length}개)보다 많이 회수할 수 없습니다.`);
  }

  const toRemove = stamps.slice(0, count);
  for (const d of toRemove) {
    await addDoc(collection(db, `users/${uuid}/stampHistory`), {
      action: 'recall',
      stampId: d.id,
      date: d.data().date,
      method: d.data().method,
      timestamp: Timestamp.now(),
      message: 'ADMIN 방식으로 스탬프 회수',
    });
    await deleteDoc(d.ref);
  }

  await logAction(uuid, '스탬프 회수', `ADMIN 방식으로 ${count}개 회수`);
  await sendPushToUser({
    uuid,
    title: '스탬프가 회수되었습니다.',
    body: `스탬프 ${count}개가 관리자에 의해 회수되었습니다.`,
    data: { screen: 'stamp', uuid },
  });
}

export async function getStamps(uuid: string): Promise<string[]> {
  const mapped = await resolveFirestoreUserId(uuid);
  if (!mapped) return [];
  uuid = mapped;
  const db = getFirebaseDb();
  const snapshot = await getDocs(collection(db, `users/${uuid}/stamps`));
  const docs = snapshot.docs.sort(
    (a, b) => (a.data().timestamp?.seconds ?? 0) - (b.data().timestamp?.seconds ?? 0)
  );

  return docs.map((d) => {
    const data = d.data();
    const ts = data.timestamp?.toDate?.();
    const method = data.method || '알 수 없음';
    if (ts instanceof Date) {
      return `${format(ts, 'yy-MM-dd')}|${method}|${format(ts, 'HH:mm:ss')}`;
    }
    return `-|${method}|-`;
  });
}

export async function issueCoupon(uuid: string): Promise<void> {
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  await addDoc(collection(db, `users/${uuid}/coupons`), {
    issuedAt: getTodayDate(),
    reason: '10회 적립 100% 할인',
    used: false,
    isHalf: 'N',
  });
  await logAction(uuid, '쿠폰 발급', '10회 적립 100% 할인 쿠폰 발급');
}

export async function clearStamps(uuid: string): Promise<void> {
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const stampRef = collection(db, `users/${uuid}/stamps`);
  const historyRef = collection(db, `users/${uuid}/stampHistory`);
  const snapshot = await getDocs(stampRef);
  for (const docSnap of snapshot.docs) {
    await addDoc(historyRef, {
      action: 'remove',
      stampId: docSnap.id,
      date: docSnap.data().date,
      method: docSnap.data().method,
      timestamp: Timestamp.now(),
      message: '쿠폰 발급으로 스탬프 삭제',
    });
    await deleteDoc(docSnap.ref);
  }
  await logAction(uuid, '스탬프 초기화', '10개 스탬프 삭제');
}

export type CouponItem = {
  id: string;
  reason?: string;
  issuedAt?: string;
  used?: boolean;
  isHalf?: string;
  deleted?: boolean;
};

export async function getCoupons(uuid: string): Promise<CouponItem[]> {
  const mapped = await resolveFirestoreUserId(uuid);
  if (!mapped) return [];
  uuid = mapped;
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, `users/${uuid}/coupons`));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        reason: data.reason as string | undefined,
        issuedAt: typeof data.issuedAt === 'string' ? data.issuedAt : undefined,
        used: Boolean(data.used),
        isHalf: data.isHalf === 'Y' ? 'Y' : data.isHalf === 'N' ? undefined : data.isHalf,
        deleted: Boolean(data.deleted),
      };
    })
    .filter((c) => !c.deleted)
    .sort((a, b) => String(b.issuedAt ?? '').localeCompare(String(a.issuedAt ?? '')));
}

export async function revokeCoupon(uuid: string, couponId: string): Promise<void> {
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  await deleteDoc(doc(db, `users/${uuid}/coupons`, couponId));
}

export async function getCouponCount(uuid: string): Promise<number> {
  const mapped = await resolveFirestoreUserId(uuid);
  if (!mapped) return 0;
  uuid = mapped;
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, `users/${uuid}/coupons`), where('used', '==', false))
  );
  return snap.docs.filter((d) => d.data().deleted !== true).length;
}

export async function deleteUser(uuid: string): Promise<void> {
  const { purgeFirebaseMemberData } = await import('@/lib/member-purge.firebase');
  const mapped = await resolveFirestoreUserId(uuid);
  await purgeFirebaseMemberData([uuid, mapped].filter((id): id is string => Boolean(id)));
}

export async function useOneCoupon(uuid: string): Promise<void> {
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, `users/${uuid}/coupons`), where('used', '==', false), limit(1))
  );
  if (snap.empty) throw new Error('사용 가능한 쿠폰이 없습니다.');

  const docSnap = snap.docs[0]!;
  const data = docSnap.data();
  if (data.isHalf === 'Y') {
    throw new Error('즉시 쿠폰 사용 불가 (50% 쿠폰 보유)\n직접 쿠폰을 선택해주세요.');
  }

  await updateDoc(docSnap.ref, { used: true });
  await logAction(uuid, '쿠폰 사용', `자동 선택 쿠폰 사용: ${data.reason || '쿠폰'}`);
}

export async function useCouponById(uuid: string, couponId: string): Promise<void> {
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const couponRef = doc(db, `users/${uuid}/coupons`, couponId);
  const couponSnap = await getDoc(couponRef);
  if (!couponSnap.exists()) throw new Error('해당 쿠폰을 찾을 수 없습니다.');

  const data = couponSnap.data();
  if (data.used === true) throw new Error('이미 사용된 쿠폰입니다.');

  await updateDoc(couponRef, { used: true, usedAt: Timestamp.now() });
  await logAction(uuid, '쿠폰 사용', `${data.reason || '쿠폰'} 사용됨`);
}

export async function deleteStamp(uuid: string, value: string, _p0: string, _p1: string) {
  uuid = await mapUuid(uuid);
  const [date, method, time] = value.split('|');
  if (!date || !method || !time) {
    console.warn('❗ 잘못된 스탬프 문자열 형식:', value);
    return;
  }

  const parsed = new Date(`20${date}T${time}`);
  if (isNaN(parsed.getTime())) {
    console.warn('❗ timestamp 변환 실패:', date, time);
    return;
  }

  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, `users/${uuid}/stamps`));

  for (const d of snap.docs) {
    const data = d.data();
    const docTimestamp = data.timestamp?.toDate?.();
    const sameTime =
      docTimestamp instanceof Date && Math.abs(docTimestamp.getTime() - parsed.getTime()) < 1000;

    if (data.method === method && sameTime) {
      await deleteDoc(d.ref);
      await addDoc(collection(db, `users/${uuid}/stampHistory`), {
        action: 'recall',
        stampId: d.id,
        date,
        method,
        timestamp: Timestamp.now(),
        message: `${date} ${time} ${method} 스탬프 관리자 회수`,
      });
      await sendPushToUser({
        uuid,
        title: '스탬프가 회수되었습니다.',
        body: `${date} ${time} 스탬프 1개가 관리자에 의해 회수되었습니다.`,
        data: { screen: 'stamp', uuid },
      });
      await logAction(uuid, '스탬프 회수', `${date} ${time} ${method} 방식`);
      return;
    }
  }

  console.warn('❌ 일치하는 스탬프 문서 없음:', value);
}

export async function attachReasonToRecentStampHistory(
  uuid: string,
  action: 'add' | 'recall',
  count: number,
  reason: string
): Promise<void> {
  if (count < 1 || !reason.trim()) return;
  const mapped = await resolveFirestoreUserId(uuid);
  const ids = [...new Set([mapped, uuid].filter((id): id is string => Boolean(id)))];
  const db = getFirebaseDb();
  const baseMessage =
    action === 'add' ? 'ADMIN 방식으로 스탬프 적립' : 'ADMIN 방식으로 스탬프 회수';
  const withReason = `${baseMessage} (${reason})`;

  for (const id of ids) {
    const snap = await getDocs(collection(db, `users/${id}/stampHistory`));
    const matches = snap.docs
      .filter((d) => {
        const data = d.data();
        if (data.action !== action) return false;
        const message = String(data.message ?? '');
        return message === baseMessage || (message.startsWith(baseMessage) && !message.includes('('));
      })
      .sort((a, b) => (b.data().timestamp?.seconds ?? 0) - (a.data().timestamp?.seconds ?? 0))
      .slice(0, count);
    await Promise.all(matches.map((d) => updateDoc(d.ref, { message: withReason }).catch(() => undefined)));
  }
}

export async function addStampBatchWithReason(
  uuid: string,
  count: number,
  reason: string
): Promise<void> {
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const stampRef = collection(db, `users/${uuid}/stamps`);
  const userRef = doc(db, 'users', uuid);
  const now = new Date();
  const reasonText = reason.trim();
  const historyMessage = reasonText
    ? `ADMIN 방식으로 스탬프 적립 (${reasonText})`
    : 'ADMIN 방식으로 스탬프 적립';

  const stampDataList = Array.from({ length: count }, (_, i) => ({
    date: getTodayDate(),
    method: 'ADMIN' as const,
    timestamp: new Date(now.getTime() + i * 1000),
  }));

  for (const data of stampDataList) {
    const stampDocRef = await addDoc(stampRef, data);
    await addDoc(collection(db, `users/${uuid}/stampHistory`), {
      action: 'add',
      stampId: stampDocRef.id,
      date: data.date,
      method: data.method,
      timestamp: Timestamp.now(),
      message: historyMessage,
    });
  }

  await updateDoc(userRef, {
    lastStampTime: stampDataList[count - 1]!.timestamp,
  });
  await logAction(
    uuid,
    '스탬프 적립',
    reasonText ? `ADMIN 방식으로 ${count}개 적립 (${reasonText})` : `ADMIN 방식으로 ${count}개 적립`
  );

  const allSnap = await getDocs(stampRef);
  const allStamps = allSnap.docs.sort(
    (a, b) => (a.data().timestamp?.seconds ?? 0) - (b.data().timestamp?.seconds ?? 0)
  );
  const fullCouponCount = Math.floor(allStamps.length / 10);

  for (let i = 0; i < fullCouponCount; i++) {
    await issueCoupon(uuid);
    const toDelete = allStamps.splice(0, 10);
    for (const d of toDelete) {
      await addDoc(collection(db, `users/${uuid}/stampHistory`), {
        action: 'remove',
        stampId: d.id,
        date: d.data().date,
        method: d.data().method,
        timestamp: Timestamp.now(),
        message: '쿠폰 발급으로 스탬프 삭제',
      });
      await deleteDoc(d.ref);
    }
  }

  if (fullCouponCount > 0) {
    await sendPushToUser({
      uuid,
      title: '쿠폰이 발급되었습니다~! 🎁',
      body: `스탬프 ${fullCouponCount * 10}개 적립! 쿠폰 ${fullCouponCount}개가 발급되었어요~!`,
      data: { screen: 'coupons', uuid },
    });
  }
}

export async function removeStampBatchWithReason(
  uuid: string,
  count: number,
  reason: string
): Promise<void> {
  if (count < 1) return;
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, `users/${uuid}/stamps`));
  const stamps = snap.docs.sort(
    (a, b) => (b.data().timestamp?.seconds ?? 0) - (a.data().timestamp?.seconds ?? 0)
  );

  if (stamps.length < count) {
    throw new Error(`보유 스탬프(${stamps.length}개)보다 많이 회수할 수 없습니다.`);
  }

  const reasonText = reason.trim();
  const historyMessage = reasonText
    ? `ADMIN 방식으로 스탬프 회수 (${reasonText})`
    : 'ADMIN 방식으로 스탬프 회수';

  const toRemove = stamps.slice(0, count);
  for (const d of toRemove) {
    await addDoc(collection(db, `users/${uuid}/stampHistory`), {
      action: 'recall',
      stampId: d.id,
      date: d.data().date,
      method: d.data().method,
      timestamp: Timestamp.now(),
      message: historyMessage,
    });
    await deleteDoc(d.ref);
  }

  await logAction(
    uuid,
    '스탬프 회수',
    reasonText ? `ADMIN 방식으로 ${count}개 회수 (${reasonText})` : `ADMIN 방식으로 ${count}개 회수`
  );
}

export async function adjustCouponsWithReason(
  uuid: string,
  increment: number,
  reason: string
): Promise<void> {
  if (increment === 0) return;
  uuid = await mapUuid(uuid);
  const db = getFirebaseDb();
  const amount = Math.abs(increment);
  const reasonText = reason.trim();
  const verb = increment > 0 ? '지급' : '회수';

  if (increment > 0) {
    for (let i = 0; i < amount; i++) {
      await addDoc(collection(db, `users/${uuid}/coupons`), {
        issuedAt: getTodayDate(),
        reason: reasonText ? `ADMIN 지급 (${reasonText})` : 'ADMIN 지급',
        used: false,
        isHalf: 'N',
      });
    }
  } else {
    const snap = await getDocs(
      query(collection(db, `users/${uuid}/coupons`), where('used', '==', false))
    );
    const unused = snap.docs
      .filter((d) => d.data().deleted !== true)
      .sort((a, b) => String(b.data().issuedAt ?? '').localeCompare(String(a.data().issuedAt ?? '')));
    if (unused.length < amount) {
      throw new Error(`보유 쿠폰(${unused.length}개)보다 많이 회수할 수 없습니다.`);
    }
    for (const d of unused.slice(0, amount)) {
      await deleteDoc(d.ref);
    }
  }

  await logAction(
    uuid,
    increment > 0 ? '쿠폰 지급' : '쿠폰 회수',
    reasonText ? `ADMIN 방식으로 ${amount}개 ${verb} (${reasonText})` : `ADMIN 방식으로 ${amount}개 ${verb}`
  );
}
