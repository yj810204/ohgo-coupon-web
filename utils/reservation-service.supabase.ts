import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getSiteSettings } from '@/utils/site-settings-service';
import { getAllTrips, isPastTripSchedule } from '@/utils/trip-guide-service';
import { notifyAllAdmins, sendPushToUser } from '@/utils/send-push';
import {
  ACTIVE_RESERVATION_STATUSES,
  formatTripLabel,
  sortReservationsByCreatedDesc,
  sortReservationsByTripDateDesc,
  type BoardingInfoSummary,
  type CreateReservationResult,
  type TripReservation,
  type TripReservationStatus,
} from './reservation-shared';

function mapRow(row: Record<string, unknown>): TripReservation {
  const tripDate = row.trip_date as string | null;
  return {
    id: row.id as string,
    tripId: (row.trip_id as string) ?? '',
    tripDate: tripDate ? String(tripDate).split('T')[0] : '',
    destination: (row.destination as string) ?? '',
    departureTime: (row.departure_time as string) ?? '',
    returnTime: (row.return_time as string) ?? undefined,
    userUuid: (row.user_id as string) ?? '',
    userName: (row.user_name as string) ?? '',
    userPhone: (row.user_phone as string) ?? '',
    status: (row.status as TripReservationStatus) ?? 'pending',
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at ?? row.created_at) as string,
    rejectedReason: (row.rejected_reason as string) ?? undefined,
  };
}

export async function getBoardingInfo(userUuid: string): Promise<BoardingInfoSummary | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('boarding_info')
    .select('name, phone, birth, gender')
    .eq('user_id', userUuid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const name = String(data.name ?? '').trim();
  const phone = String(data.phone ?? '').trim();
  if (!name || !phone) return null;
  return {
    name,
    phone,
    birth: data.birth ? String(data.birth) : undefined,
    gender: data.gender ? String(data.gender) : undefined,
  };
}

export async function hasBoardingInfo(userUuid: string): Promise<boolean> {
  return (await getBoardingInfo(userUuid)) != null;
}

export async function getReservationSettings() {
  const settings = await getSiteSettings();
  return {
    enabled: settings.reservationEnabled ?? false,
    approvalMode: settings.reservationApprovalMode ?? 'manual',
  };
}

export async function getReservationsByTrip(tripId: string): Promise<TripReservation[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from('trip_reservations').select('*').eq('trip_id', tripId);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapRow(row)).sort(sortReservationsByCreatedDesc);
}

export async function getReservationCount(tripId: string): Promise<number> {
  const list = await getReservationsByTrip(tripId);
  return list.filter((r) => ACTIVE_RESERVATION_STATUSES.includes(r.status)).length;
}

export async function hasUserReserved(tripId: string, userUuid: string): Promise<TripReservation | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('trip_reservations')
    .select('*')
    .eq('trip_id', tripId)
    .eq('user_id', userUuid);
  if (error) throw error;
  const active = (data ?? [])
    .map((row: Record<string, unknown>) => mapRow(row))
    .find((r: TripReservation) => ACTIVE_RESERVATION_STATUSES.includes(r.status));
  return active ?? null;
}

export async function getMyReservations(userUuid: string): Promise<TripReservation[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('trip_reservations')
    .select('*')
    .eq('user_id', userUuid);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapRow(row)).sort(sortReservationsByTripDateDesc);
}

export async function getAllReservations(): Promise<TripReservation[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from('trip_reservations').select('*');
  if (error) throw error;
  return (data ?? [])
    .map((row: Record<string, unknown>) => mapRow(row))
    .sort((a: TripReservation, b: TripReservation) => {
      const da = b.tripDate.localeCompare(a.tripDate);
      if (da !== 0) return da;
      return sortReservationsByCreatedDesc(a, b);
    });
}

export async function createReservation(
  tripId: string,
  user: { uuid: string; name: string },
): Promise<CreateReservationResult> {
  try {
    const { enabled, approvalMode } = await getReservationSettings();
    if (!enabled) return { ok: false, code: 'DISABLED' };

    const boarding = await getBoardingInfo(user.uuid);
    if (!boarding?.phone) return { ok: false, code: 'NO_BOARDING' };
    const userPhone = boarding.phone;
    const userName = boarding.name || user.name;

    const trips = await getAllTrips();
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return { ok: false, code: 'TRIP_NOT_FOUND' };

    if (isPastTripSchedule(trip.date, trip.departureTime)) {
      return { ok: false, code: 'PAST_TRIP' };
    }

    if (await hasUserReserved(tripId, user.uuid)) return { ok: false, code: 'DUPLICATE' };

    if (trip.capacity != null && trip.capacity > 0) {
      const count = await getReservationCount(tripId);
      if (count >= trip.capacity) return { ok: false, code: 'FULL' };
    }

    const status: TripReservationStatus = approvalMode === 'auto' ? 'confirmed' : 'pending';
    const now = new Date().toISOString();
    const supabase = getSupabaseBrowserClient();

    const { data, error } = await supabase
      .from('trip_reservations')
      .insert({
        trip_id: trip.id,
        trip_date: trip.date,
        destination: trip.destination,
        departure_time: trip.departureTime,
        return_time: trip.returnTime ?? null,
        user_id: user.uuid,
        user_name: userName,
        user_phone: userPhone,
        status,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('createReservation insert error:', error);
      return { ok: false, code: 'UNKNOWN' };
    }

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

    return { ok: true, reservationId: data.id, status };
  } catch (e) {
    console.error('createReservation error:', e);
    return { ok: false, code: 'UNKNOWN' };
  }
}

async function getReservationById(reservationId: string): Promise<TripReservation | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('trip_reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function cancelReservation(reservationId: string, userUuid: string): Promise<boolean> {
  const reservation = await getReservationById(reservationId);
  if (!reservation) return false;
  if (reservation.userUuid !== userUuid) return false;
  if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) return false;

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('trip_reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', reservationId);
  return !error;
}

export async function approveReservation(reservationId: string): Promise<boolean> {
  const reservation = await getReservationById(reservationId);
  if (!reservation || reservation.status !== 'pending') return false;

  const trips = await getAllTrips();
  const trip = trips.find((t) => t.id === reservation.tripId);
  if (trip?.capacity != null && trip.capacity > 0) {
    const count = await getReservationCount(reservation.tripId);
    if (count >= trip.capacity) return false;
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('trip_reservations')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', reservationId);
  if (error) return false;

  const label = trip ? formatTripLabel(trip) : reservation.destination;
  await sendPushToUser({
    uuid: reservation.userUuid,
    title: '예약 확정',
    body: `${label} 예약이 확정되었습니다.`,
    data: { screen: 'my-reservations' },
  });
  return true;
}

export async function rejectReservation(reservationId: string, reason?: string): Promise<boolean> {
  const reservation = await getReservationById(reservationId);
  if (!reservation || reservation.status !== 'pending') return false;

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('trip_reservations')
    .update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
      ...(reason?.trim() ? { rejected_reason: reason.trim() } : {}),
    })
    .eq('id', reservationId);
  if (error) return false;

  const trips = await getAllTrips();
  const trip = trips.find((t) => t.id === reservation.tripId);
  const label = trip ? formatTripLabel(trip) : reservation.destination;
  await sendPushToUser({
    uuid: reservation.userUuid,
    title: '예약 거절',
    body: reason?.trim()
      ? `${label} 예약이 거절되었습니다. (${reason.trim()})`
      : `${label} 예약이 거절되었습니다.`,
    data: { screen: 'my-reservations' },
  });
  return true;
}

export async function adminCancelReservation(reservationId: string): Promise<boolean> {
  const reservation = await getReservationById(reservationId);
  if (!reservation || !ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) return false;

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('trip_reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', reservationId);
  return !error;
}

export async function deleteCancelledReservation(
  reservationId: string,
  userUuid: string,
): Promise<boolean> {
  const reservation = await getReservationById(reservationId);
  if (!reservation) return false;
  if (reservation.status !== 'cancelled') return false;
  if (reservation.userUuid !== userUuid) return false;

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('trip_reservations').delete().eq('id', reservationId);
  return !error;
}

export async function adminDeleteCancelledReservation(reservationId: string): Promise<boolean> {
  const reservation = await getReservationById(reservationId);
  if (!reservation || reservation.status !== 'cancelled') return false;

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('trip_reservations').delete().eq('id', reservationId);
  return !error;
}
