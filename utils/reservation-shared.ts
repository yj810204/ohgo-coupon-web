import type { ReservationApprovalMode } from '@/utils/site-settings-shared';

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
  createdAt: Date | string;
  updatedAt: Date | string;
  rejectedReason?: string;
}

export type CreateReservationResult =
  | { ok: true; reservationId: string; status: TripReservationStatus }
  | {
      ok: false;
      code:
        | 'DISABLED'
        | 'NO_BOARDING'
        | 'DUPLICATE'
        | 'FULL'
        | 'TRIP_NOT_FOUND'
        | 'PAST_TRIP'
        | 'UNKNOWN';
    };

export const ACTIVE_RESERVATION_STATUSES: TripReservationStatus[] = ['pending', 'confirmed'];

export interface BoardingInfoSummary {
  name: string;
  phone: string;
  birth?: string;
  gender?: string;
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

export function sortReservationsByTripDateDesc(a: TripReservation, b: TripReservation): number {
  const da = a.tripDate.localeCompare(b.tripDate);
  if (da !== 0) return da;
  return toTime(b.createdAt) - toTime(a.createdAt);
}

export function sortReservationsByCreatedDesc(a: TripReservation, b: TripReservation): number {
  return toTime(b.createdAt) - toTime(a.createdAt);
}

function toTime(value: Date | string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return new Date(value).getTime();
  return new Date(String(value)).getTime();
}

export function formatTripLabel(trip: { date: string; destination: string }): string {
  const m = parseInt(trip.date.split('-')[1], 10);
  const d = parseInt(trip.date.split('-')[2], 10);
  return `${m}/${d} ${trip.destination}`;
}

export type { ReservationApprovalMode };
