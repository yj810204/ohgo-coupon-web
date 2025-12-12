import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  Timestamp,
  orderBy,
  QueryConstraint,
  runTransaction
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendPushToUser } from './send-push';
import { format } from 'date-fns';

async function logAction(uuid: string, action: string, detail: string) {
  const logRef = collection(db, `users/${uuid}/logs`);
  await addDoc(logRef, {
    action,
    detail,
    timestamp: Timestamp.now(),
  });
}

/** 오늘 날짜 기준 시작과 끝 Timestamp 반환 */
function getTodayRange(): { start: Timestamp; end: Timestamp } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return {
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
  };
}

/** YYYY-MM-DD 포맷으로 오늘 날짜 반환 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
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
  const conds: QueryConstraint[] = [orderBy('timestamp', 'desc')];
  if (startDate) conds.push(where('timestamp', '>=', Timestamp.fromDate(startDate)));
  if (endDate) conds.push(where('timestamp', '<=', Timestamp.fromDate(endDate)));
  const q = query(collection(db, `users/${uuid}/stampHistory`), ...conds);
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function issue50PercentCoupon(uuid: string): Promise<void> {
  const snap = await getDocs(collection(db, `users/${uuid}/stamps`));
  const stamps = snap.docs.sort((a, b) =>
    (a.data().createdAt?.seconds || 0) - (b.data().createdAt?.seconds || 0)
  );

  if (stamps.length < 5) return;

  const toDelete = stamps.slice(0, 5);
  await Promise.all(toDelete.map(d => deleteDoc(d.ref)));

  const couponRef = collection(db, `users/${uuid}/coupons`);
  await addDoc(couponRef, {
    issuedAt: getTodayDate(),
    reason: '5회 적립 50% 할인',
    used: false,
    isHalf: "Y"
  });

  await logAction(uuid, '쿠폰 발급', '5회 적립 50% 할인 쿠폰 발급');
}

/** 스탬프 적립 */
export async function addStamp(uuid: string, method: 'QR' | 'ADMIN' = 'QR'): Promise<void> {
  const userRef = doc(db, 'users', uuid);
  const stampRef = collection(db, `users/${uuid}/stamps`);
  const now = Date.now();

  // QR 방식일 경우, 오늘 쿠폰 사용 여부 확인
  if (method === 'QR') {
    const { start, end } = getTodayRange();
    const couponRef = collection(db, `users/${uuid}/coupons`);
    const snapshot = await getDocs(query(couponRef, where('used', '==', true)));

    const hasUsedToday = snapshot.docs.some(doc => {
      const issuedAt = doc.data().issuedAt;
      let issuedDate: Date | null = null;

      // Timestamp 타입일 경우
      if (issuedAt instanceof Timestamp) {
        issuedDate = issuedAt.toDate();
      }

      // string 타입일 경우 (예: '2025-06-02')
      if (typeof issuedAt === 'string') {
        issuedDate = new Date(issuedAt + 'T00:00:00');
      }

      return (
        issuedDate &&
        issuedDate >= start.toDate() &&
        issuedDate <= end.toDate()
      );
    });

    if (hasUsedToday) {
      throw new Error('오늘은 쿠폰 사용으로 QR 스탬프 적립이 제한됩니다.\n추가 적립은 선장님께 문의해주세요.');
    }
  }

  // ✅ 사용자 문서에서 마지막 적립 시간 확인
  const userSnap = await getDoc(userRef);
  const lastStampTime = userSnap.exists()
    ? userSnap.data()?.lastStampTime?.toMillis?.() ?? 0
    : 0;

  // ✅ QR: 8시간 제한 / ADMIN: 1초 제한
  const LIMIT_MS = method === 'QR' ? 8 * 60 * 60 * 1000 : 1000;

  if (lastStampTime && now - lastStampTime < LIMIT_MS) {
    const nextAvailable = new Date(lastStampTime + LIMIT_MS);
    const hours = nextAvailable.getHours().toString().padStart(2, '0');
    const minutes = nextAvailable.getMinutes().toString().padStart(2, '0');

    throw new Error(`다음 적립은 ${hours}:${minutes} 이후에 가능합니다.\n추가 적립은 선장님께 문의해주세요.`);
  }

  // ✅ 1. 새 스탬프 적립
  const stampTimestamp = Timestamp.now();
  const stampData = {
    date: getTodayDate(),
    method,
    timestamp: stampTimestamp,
  };

  // 스탬프 추가 (먼저 실행하여 실패 시 lastStampTime이 업데이트되지 않도록)
  const stampDocRef = await addDoc(stampRef, stampData);
  
  // 히스토리 기록
  const historyRef = collection(db, `users/${uuid}/stampHistory`);
  await addDoc(historyRef, {
    action: 'add',
    stampId: stampDocRef.id,
    date: getTodayDate(),
    method,
    timestamp: Timestamp.now(),
    message: `${method} 방식으로 스탬프 적립`,
  });

  // ✅ 2. 사용자 정보에 마지막 적립 시간 업데이트 (스탬프 추가 성공 후)
  await updateDoc(userRef, {
    lastStampTime: stampTimestamp,
  });

  await logAction(uuid, '스탬프 적립', `${method} 방식으로 1개 적립`);

  // ✅ 3. 스탬프 수 확인
  const snapshotAfter = await getDocs(stampRef);
  const totalCount = snapshotAfter.size;

  // ✅ 4. 조건 충족 시 쿠폰 발급
  if (totalCount >= 10) {
    await issueCoupon(uuid);
    await clearStamps(uuid);

    console.log('쿠폰 발급 완료:', uuid);
    await sendPushToUser({
      uuid,
      title: '쿠폰이 발급되었습니다~! 🎁',
      body: '스탬프 10개 도달! 쿠폰이 발급되었어요~!',
      data: {
        screen: 'coupons',
        uuid,
      },
    });
  }
}

export async function addStampBatch(uuid: string, count: number): Promise<void> {
  const stampRef = collection(db, `users/${uuid}/stamps`);
  const userRef = doc(db, 'users', uuid);
  const now = new Date();

  // ✅ 1. 스탬프 5개 생성 - 1초씩 차이나게
  const stampDataList = Array.from({ length: count }, (_, i) => ({
    date: getTodayDate(),
    method: 'ADMIN',
    timestamp: new Date(now.getTime() + i * 1000), // ✅ 1초씩 차이
  }));

  for (const data of stampDataList) {
    const stampDocRef = await addDoc(stampRef, data);
    const historyRef = collection(db, `users/${uuid}/stampHistory`);
    await addDoc(historyRef, {
      action: 'add',
      stampId: stampDocRef.id,
      date: data.date,
      method: data.method,
      timestamp: Timestamp.now(),
      message: `ADMIN 방식으로 스탬프 적립`,
    });
  }

  await updateDoc(userRef, {
    lastStampTime: stampDataList[count - 1].timestamp,
  });

  await logAction(uuid, '스탬프 적립', `ADMIN 방식으로 ${count}개 적립`);

  // ✅ 2. 전체 스탬프 수 확인 후 쿠폰 처리
  const allSnap = await getDocs(stampRef);
  const allStamps = allSnap.docs.sort((a, b) =>
    (a.data().timestamp?.seconds ?? 0) - (b.data().timestamp?.seconds ?? 0)
  );

  const totalCount = allStamps.length;
  const fullCouponCount = Math.floor(totalCount / 10);

  // ✅ 3. 쿠폰 발급 & 스탬프 회수
  for (let i = 0; i < fullCouponCount; i++) {
    await issueCoupon(uuid);
    const toDelete = allStamps.splice(0, 10);

    const historyRef = collection(db, `users/${uuid}/stampHistory`);
    for (const d of toDelete) {
      await addDoc(historyRef, {
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
      data: {
        screen: 'coupons',
        uuid,
      },
    });
  }
}

/** 스탬프 목록 조회 */
export async function getStamps(uuid: string): Promise<string[]> {
  const stampRef = collection(db, `users/${uuid}/stamps`);
  const snapshot = await getDocs(stampRef);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    const method = data.method || '알 수 없음';
    
    // timestamp 처리: Firestore Timestamp 또는 Date 객체 모두 처리
    let ts: Date | null = null;
    
    if (data.timestamp) {
      // Firestore Timestamp인 경우
      if (data.timestamp.toDate && typeof data.timestamp.toDate === 'function') {
        ts = data.timestamp.toDate();
      }
      // 이미 Date 객체인 경우
      else if (data.timestamp instanceof Date) {
        ts = data.timestamp;
      }
      // Timestamp 객체인 경우 (seconds, nanoseconds 속성)
      else if (data.timestamp.seconds !== undefined) {
        ts = new Date(data.timestamp.seconds * 1000 + (data.timestamp.nanoseconds || 0) / 1000000);
      }
    }

    if (ts instanceof Date && !isNaN(ts.getTime())) {
      // 목록에선 일단 날짜만 전달 (모달에서 full 시간 표시)
      const ymd = format(ts, 'yy-MM-dd');
      const hms = format(ts, 'HH:mm:ss');
      return `${ymd}|${method}|${hms}`; // 시:분:초는 숨겨져 있다가 모달에서만 사용
    }

    // timestamp가 없거나 파싱 실패한 경우 date 필드 사용
    if (data.date) {
      return `${data.date.replace(/-/g, '-')}|${method}|00:00:00`;
    }

    return `-|${method}|-`;
  });
}


/** 쿠폰 발급 */
export async function issueCoupon(uuid: string): Promise<void> {
  const couponRef = collection(db, `users/${uuid}/coupons`);
  await addDoc(couponRef, {
    issuedAt: getTodayDate(),
    reason: '10회 적립 100% 할인',
    used: false,
    isHalf: "N",
  });

  await logAction(uuid, '쿠폰 발급', '10회 적립 100% 할인 쿠폰 발급');
}

/** 스탬프 모두 삭제 */
export async function clearStamps(uuid: string): Promise<void> {
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

/** 발급된 쿠폰 수 조회 */
export async function getCouponCount(uuid: string): Promise<number> {
  const couponRef = collection(db, `users/${uuid}/coupons`);
  const q = query(couponRef, where('used', '==', false)); // ✅ 사용 안 한 쿠폰만
  const snapshot = await getDocs(q);
  return snapshot.size;
}

/** 유저 전체 삭제: 문서 + 하위 컬렉션 */
export async function deleteUser(uuid: string): Promise<void> {
  const userRef = doc(db, 'users', uuid);

  // 1. stamps 삭제
  const stampsRef = collection(db, `users/${uuid}/stamps`);
  const stampsSnap = await getDocs(stampsRef);
  for (const docSnap of stampsSnap.docs) {
    await deleteDoc(docSnap.ref);
  }

  // 2. coupons 삭제
  const couponsRef = collection(db, `users/${uuid}/coupons`);
  const couponsSnap = await getDocs(couponsRef);
  for (const docSnap of couponsSnap.docs) {
    await deleteDoc(docSnap.ref);
  }

  // 3. 사용자 문서 삭제
  await deleteDoc(userRef);
}

export async function useOneCoupon(uuid: string): Promise<void> {
  const couponRef = collection(db, `users/${uuid}/coupons`);
  const q = query(couponRef, where('used', '==', false), limit(1));
  const snapshot = await getDocs(q);

  if (snapshot.empty) throw new Error('사용 가능한 쿠폰이 없습니다.');

  const docSnap = snapshot.docs[0];
  const data = docSnap.data();

  if (data.isHalf === 'Y') {
    throw new Error('즉시 쿠폰 사용 불가 (50% 쿠폰 보유)\n직접 쿠폰을 선택해주세요.');
  }

  await updateDoc(docSnap.ref, { used: true });
  await logAction(uuid, '쿠폰 사용', `자동 선택 쿠폰 사용: ${data.reason || '쿠폰'}`);
}

export async function useCouponById(uuid: string, couponId: string): Promise<void> {
  const couponRef = doc(db, `users/${uuid}/coupons/${couponId}`);
  const couponSnap = await getDoc(couponRef);

  if (!couponSnap.exists()) {
    throw new Error('해당 쿠폰을 찾을 수 없습니다.');
  }

  const data = couponSnap.data();

  if (data.used === true) {
    throw new Error('이미 사용된 쿠폰입니다.');
  }

  await updateDoc(couponRef, {
    used: true,
    usedAt: Timestamp.now(), // ✅ 사용 시점 기록
  });

  await logAction(uuid, '쿠폰 사용', `${data.reason || '쿠폰'} 사용됨`);
}


/**
 * 사용자 스탬프 중 정확한 timestamp (date|method|time) 일치하는 문서를 삭제
 */
export async function deleteStamp(uuid: string, value: string, p0: string, p1: string) {
  const [date, method, time] = value.split('|');
  if (!date || !method || !time) {
    console.warn('❗ 잘못된 스탬프 문자열 형식:', value);
    return;
  }

  // 비교용 Date 객체 만들기
  const parsed = new Date(`20${date}T${time}`);
  if (isNaN(parsed.getTime())) {
    console.warn('❗ timestamp 변환 실패:', date, time);
    return;
  }

  const ref = collection(db, `users/${uuid}/stamps`);
  const snap = await getDocs(ref);

  for (const doc of snap.docs) {
    const data = doc.data();
    const docTimestamp = data.timestamp?.toDate?.();

    const sameTime =
      docTimestamp instanceof Date &&
      Math.abs(docTimestamp.getTime() - parsed.getTime()) < 1000; // 1초 허용

    if (data.method === method && sameTime) {
      console.log('🧹 삭제할 문서 ID:', doc.id);
      await deleteDoc(doc.ref);

      const historyRef = collection(db, `users/${uuid}/stampHistory`);
      await addDoc(historyRef, {
        action: 'recall',
        stampId: doc.id,
        date,
        method,
        timestamp: Timestamp.now(),
        message: `${date} ${time} ${method} 스탬프 관리자 회수`,
      });
      
      // ✅ 푸시 알림 전송
      await sendPushToUser({
        uuid,
        title: '스탬프가 회수되었습니다.',
        body: `${date} ${time} 스탬프 1개가 관리자에 의해 회수되었습니다.`,
        data: {
          screen: 'stamp',
          uuid
        },
      });

      console.log('✅ 스탬프 삭제 및 푸시 완료');
      await logAction(uuid, '스탬프 회수', `${date} ${time} ${method} 방식`);
      return;
    }
  }

  console.warn('❌ 일치하는 스탬프 문서 없음:', value);
}

