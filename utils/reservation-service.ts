import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getSiteSettings, type ReservationApprovalMode } from '@/utils/site-settings-service';
import { getAllTrips, isPastTripSchedule, type TripGuide } from '@/utils/trip-guide-service';
import { notifyAllAdmins, sendPushToUser } from '@/utils/send-push';

export type TripReservationStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

export interface TripReservation {
  id: string;
  tripId: string;
  tripDate: string;
  destination: string;
  departureTime: string;
  returnTime?: string;
  userUuid: string;
  userName: string;
  userPhone: string;
  status: TripReservationStatus;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  rejectedReason?: string;
}

export type CreateReservationResult =
  | { ok: true; reservationId: string; status: TripReservationStatus }
  | { ok: false; code: 'DISABLED' | 'NO_BOARDING' | 'DUPLICATE' | 'FULL' | 'TRIP_NOT_FOUND' | 'PAST_TRIP' | 'UNKNOWN' };

const COL = 'tripReservations';

const ACTIVE_STATUSES: TripReservationStatus[] = ['pending', 'confirmed'];

function mapReservation(id: string, data: Record<string, unknown>): TripReservation {
  return {
    id,
    tripId: String(data.tripId ?? ''),
    tripDate: String(data.tripDate ?? ''),
    destination: String(data.destination ?? ''),
    departureTime: String(data.departureTime ?? ''),
    returnTime: data.returnTime ? String(data.returnTime) : undefined,
    userUuid: String(data.userUuid ?? ''),
    userName: String(data.userName ?? ''),
    userPhone: String(data.userPhone ?? ''),
    status: (data.status as TripReservationStatus) ?? 'pending',
    createdAt: (data.createdAt as Timestamp) ?? new Date(),
    updatedAt: (data.updatedAt as Timestamp) ?? new Date(),
    rejectedReason: data.rejectedReason ? String(data.rejectedReason) : undefined,
  };
}

export interface BoardingInfoSummary {
  name: string;
  phone: string;
  birth?: string;
  gender?: string;
}

export async function getBoardingInfo(userUuid: string): Promise<BoardingInfoSummary | null> {
  const snap = await getDoc(doc(db, 'users', userUuid, 'boarding', 'info'));
  if (!snap.exists()) return null;
  const data = snap.data();
  const name = String(data?.name ?? '').trim();
  const phone = String(data?.phone ?? '').trim();
  if (!name || !phone) return null;
  return {
    name,
    phone,
    birth: data?.birth ? String(data.birth) : undefined,
    gender: data?.gender ? String(data.gender) : undefined,
  };
}

export async function hasBoardingInfo(userUuid: string): Promise<boolean> {
  const info = await getBoardingInfo(userUuid);
  return info != null;
}

export async function getReservationSettings(): Promise<{
  enabled: boolean;
  approvalMode: ReservationApprovalMode;
}> {
  const settings = await getSiteSettings();
  return {
    enabled: settings.reservationEnabled ?? false,
    approvalMode: settings.reservationApprovalMode ?? 'manual',
  };
}

export async function getReservationsByTrip(tripId: string): Promise<TripReservation[]> {
  const q = query(collection(db, COL), where('tripId', '==', tripId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => mapReservation(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => {
      const ta = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
      const tb = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
      return tb - ta;
    });
}

export async function getReservationCount(tripId: string): Promise<number> {
  const list = await getReservationsByTrip(tripId);
  return list.filter(r => ACTIVE_STATUSES.includes(r.status)).length;
}

export async function hasUserReserved(tripId: string, userUuid: string): Promise<TripReservation | null> {
  const q = query(
    collection(db, COL),
    where('tripId', '==', tripId),
    where('userUuid', '==', userUuid),
  );
  const snap = await getDocs(q);
  const active = snap.docs
    .map(d => mapReservation(d.id, d.data() as Record<string, unknown>))
    .find(r => ACTIVE_STATUSES.includes(r.status));
  return active ?? null;
}

export async function getMyReservations(userUuid: string): Promise<TripReservation[]> {
  const q = query(collection(db, COL), where('userUuid', '==', userUuid));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => mapReservation(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => {
      const da = a.tripDate.localeCompare(b.tripDate);
      if (da !== 0) return da;
      const ta = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
      const tb = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
      return tb - ta;
    });
}

export async function getAllReservations(): Promise<TripReservation[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs
    .map(d => mapReservation(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => {
      const da = b.tripDate.localeCompare(a.tripDate);
      if (da !== 0) return da;
      const ta = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
      const tb = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
      return tb - ta;
    });
}

function formatTripLabel(trip: TripGuide): string {
  const m = parseInt(trip.date.split('-')[1], 10);
  const d = parseInt(trip.date.split('-')[2], 10);
  return `${m}/${d} ${trip.destination}`;
}

export async function createReservation(
  tripId: string,
  user: { uuid: string; name: string },
): Promise<CreateReservationResult> {
  try {
    const { enabled, approvalMode } = await getReservationSettings();
    if (!enabled) return { ok: false, code: 'DISABLED' };

    const boardingSnap = await getDoc(doc(db, 'users', user.uuid, 'boarding', 'info'));
    if (!boardingSnap.exists()) return { ok: false, code: 'NO_BOARDING' };
    const boarding = boardingSnap.data();
    const userPhone = String(boarding?.phone ?? '').trim();
    const userName = String(boarding?.name ?? user.name).trim();
    if (!userPhone) return { ok: false, code: 'NO_BOARDING' };

    const trips = await getAllTrips();
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return { ok: false, code: 'TRIP_NOT_FOUND' };

    if (isPastTripSchedule(trip.date, trip.departureTime)) {
      return { ok: false, code: 'PAST_TRIP' };
    }

    const existing = await hasUserReserved(tripId, user.uuid);
    if (existing) return { ok: false, code: 'DUPLICATE' };

    if (trip.capacity != null && trip.capacity > 0) {
      const count = await getReservationCount(tripId);
      if (count >= trip.capacity) return { ok: false, code: 'FULL' };
    }

    const status: TripReservationStatus = approvalMode === 'auto' ? 'confirmed' : 'pending';
    const now = Timestamp.now();

    const ref = await addDoc(collection(db, COL), {
      tripId: trip.id,
      tripDate: trip.date,
      destination: trip.destination,
      departureTime: trip.departureTime,
      returnTime: trip.returnTime ?? null,
      userUuid: user.uuid,
      userName,
      userPhone,
      status,
      createdAt: now,
      updatedAt: now,
    });

    const label = formatTripLabel(trip);
    if (status === 'pending') {
      await notifyAllAdmins(`${userName}님이 ${label} 출조를 예약했습니다.`, '새 예약', 'admin-reservations');
    } else {
      await sendPushToUser({
        uuid: user.uuid,
        title: '예약 확정',
        body: `${label} 예약이 확정되었습니다.`,
        data: { screen: 'my-reservations' },
      });
      await notifyAllAdmins(`${userName}님이 ${label} 출조를 예약했습니다. (자동 확정)`, '새 예약', 'admin-reservations');
    }

    return { ok: true, reservationId: ref.id, status };
  } catch (e) {
    console.error('createReservation error:', e);
    return { ok: false, code: 'UNKNOWN' };
  }
}

export async function cancelReservation(reservationId: string, userUuid: string): Promise<boolean> {
  const ref = doc(db, COL, reservationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data();
  if (data.userUuid !== userUuid) return false;
  if (!ACTIVE_STATUSES.includes(data.status as TripReservationStatus)) return false;
  await updateDoc(ref, { status: 'cancelled', updatedAt: Timestamp.now() });
  return true;
}

export async function approveReservation(reservationId: string): Promise<boolean> {
  const ref = doc(db, COL, reservationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data();
  if (data.status !== 'pending') return false;

  const tripId = String(data.tripId);
  const trips = await getAllTrips();
  const trip = trips.find(t => t.id === tripId);
  if (trip?.capacity != null && trip.capacity > 0) {
    const count = await getReservationCount(tripId);
    if (count >= trip.capacity) return false;
  }

  await updateDoc(ref, { status: 'confirmed', updatedAt: Timestamp.now() });

  const label = trip ? formatTripLabel(trip) : String(data.destination);
  await sendPushToUser({
    uuid: String(data.userUuid),
    title: '예약 확정',
    body: `${label} 예약이 확정되었습니다.`,
    data: { screen: 'my-reservations' },
  });
  return true;
}

export async function rejectReservation(reservationId: string, reason?: string): Promise<boolean> {
  const ref = doc(db, COL, reservationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data();
  if (data.status !== 'pending') return false;

  await updateDoc(ref, {
    status: 'rejected',
    updatedAt: Timestamp.now(),
    ...(reason?.trim() ? { rejectedReason: reason.trim() } : {}),
  });

  const trips = await getAllTrips();
  const trip = trips.find(t => t.id === data.tripId);
  const label = trip ? formatTripLabel(trip) : String(data.destination);
  await sendPushToUser({
    uuid: String(data.userUuid),
    title: '예약 거절',
    body: reason?.trim()
      ? `${label} 예약이 거절되었습니다. (${reason.trim()})`
      : `${label} 예약이 거절되었습니다.`,
    data: { screen: 'my-reservations' },
  });
  return true;
}

export async function adminCancelReservation(reservationId: string): Promise<boolean> {
  const ref = doc(db, COL, reservationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data();
  if (!ACTIVE_STATUSES.includes(data.status as TripReservationStatus)) return false;
  await updateDoc(ref, { status: 'cancelled', updatedAt: Timestamp.now() });
  return true;
}

/** 본인 취소(cancelled) 예약 내역 삭제 */
export async function deleteCancelledReservation(
  reservationId: string,
  userUuid: string,
): Promise<boolean> {
  const ref = doc(db, COL, reservationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data();
  if (data.status !== 'cancelled') return false;
  if (data.userUuid !== userUuid) return false;
  await deleteDoc(ref);
  return true;
}

/** 관리자 — 취소(cancelled) 예약 내역 삭제 */
export async function adminDeleteCancelledReservation(reservationId: string): Promise<boolean> {
  const ref = doc(db, COL, reservationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data();
  if (data.status !== 'cancelled') return false;
  await deleteDoc(ref);
  return true;
}

export function reservationStatusLabel(status: TripReservationStatus): string {
  switch (status) {
    case 'pending':
      return '대기';
    case 'confirmed':
      return '확정';
    case 'rejected':
      return '거절';
    case 'cancelled':
      return '취소';
    default:
      return status;
  }
}
