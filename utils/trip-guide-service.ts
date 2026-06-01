import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  updateDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface TripGuide {
  id: string;
  date: string;           // YYYY-MM-DD
  destination: string;    // 목적지
  departureTime: string;  // 출발 시간 (HH:mm)
  returnTime?: string;    // 귀항 예정 시간
  species?: string;       // 목표 어종 (참돔, 광어 등)
  capacity?: number;      // 정원
  price?: number;         // 1인 요금
  notes?: string;         // 비고 / 상세내용
  contact?: string;       // 예약 연락처
  createdAt: Timestamp | Date;
}

export type TripGuideInput = Omit<TripGuide, 'id' | 'createdAt'>;

const COL = 'tripGuides';

/** 특정 연월의 출조 목록 가져오기 (YYYY-MM prefix) */
export async function getTripsByMonth(yearMonth: string): Promise<TripGuide[]> {
  const start = `${yearMonth}-01`;
  const end = `${yearMonth}-32`; // 넉넉하게
  const q = query(
    collection(db, COL),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TripGuide));
}

/** 전체 출조 목록 */
export async function getAllTrips(): Promise<TripGuide[]> {
  const q = query(collection(db, COL), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TripGuide));
}

/** 출조 등록 */
export async function addTrip(input: TripGuideInput): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...input,
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

/** 출조 수정 */
export async function updateTrip(id: string, input: Partial<TripGuideInput>): Promise<void> {
  await updateDoc(doc(db, COL, id), input);
}

/** 출조 삭제 */
export async function deleteTrip(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
