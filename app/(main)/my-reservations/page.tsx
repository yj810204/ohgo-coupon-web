'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import {
  cancelReservation,
  deleteCancelledReservation,
  getMyReservations,
  reservationStatusLabel,
  type TripReservation,
  type TripReservationStatus,
} from '@/utils/reservation-service';
import { isPastTripSchedule, tripDateToStr } from '@/utils/trip-guide-service';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { IoCalendarOutline, IoBoatOutline } from 'react-icons/io5';
import { OHGO_CARD, OHGO_FONT } from '@/lib/page-styles';

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatTripDate(dateStr: string) {
  const m = parseInt(dateStr.split('-')[1], 10);
  const d = parseInt(dateStr.split('-')[2], 10);
  const weekday = DAY_LABELS[new Date(`${dateStr}T12:00:00`).getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

function statusBadgeStyle(status: TripReservationStatus): React.CSSProperties {
  switch (status) {
    case 'pending':
      return { backgroundColor: '#FFF8E6', color: '#E65100' };
    case 'confirmed':
      return { backgroundColor: '#E8F8EE', color: '#34C759' };
    case 'rejected':
      return { backgroundColor: '#FFEBEA', color: '#FF3B30' };
    default:
      return { backgroundColor: '#F2F3F5', color: '#6F767E' };
  }
}

export default function MyReservationsPage() {
  const router = useRouter();
  const todayStr = tripDateToStr();
  const [ready, setReady] = useState(false);
  const [userUuid, setUserUuid] = useState('');
  const [reservations, setReservations] = useState<TripReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<TripReservation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TripReservation | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (uuid: string) => {
    setLoading(true);
    try {
      const list = await getMyReservations(uuid);
      setReservations(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      setUserUuid(user.uuid);
      await load(user.uuid);
      setReady(true);
    };
    void init();
  }, [router, load]);

  useNativePullToRefresh(async () => {
    if (userUuid) await load(userUuid);
  });

  const handleCancel = async () => {
    if (!cancelTarget || !userUuid) return;
    setCancelling(true);
    try {
      const ok = await cancelReservation(cancelTarget.id, userUuid);
      if (ok) {
        setCancelTarget(null);
        await load(userUuid);
      } else {
        alert('취소할 수 없는 예약입니다.');
      }
    } finally {
      setCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !userUuid) return;
    setDeleting(true);
    try {
      const ok = await deleteCancelledReservation(deleteTarget.id, userUuid);
      if (ok) {
        setDeleteTarget(null);
        await load(userUuid);
      } else {
        alert('삭제할 수 없는 내역입니다.');
      }
    } finally {
      setDeleting(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <SubPageFrame title="나의 예약">
      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : reservations.length === 0 ? (
        <EmptyState
          icon={IoCalendarOutline}
          message="예약 내역이 없습니다."
          style={CARD}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reservations.map(r => {
            const canCancel =
              (r.status === 'pending' || r.status === 'confirmed') &&
              !isPastTripSchedule(r.tripDate, r.departureTime);
            return (
              <div key={r.id} className="p-3" style={CARD}>
                <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                  <div className="d-flex align-items-center gap-2 min-w-0">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: 36, height: 36, backgroundColor: '#EBF1FE' }}
                    >
                      <IoBoatOutline size={18} color="#237FFF" />
                    </div>
                    <div className="min-w-0">
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                        {r.destination}
                      </div>
                      <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>
                        {formatTripDate(r.tripDate)}
                      </div>
                    </div>
                  </div>
                  <span
                    className="badge rounded-pill flex-shrink-0"
                    style={{ ...statusBadgeStyle(r.status), fontSize: 11, fontFamily: FONT, fontWeight: 700 }}
                  >
                    {reservationStatusLabel(r.status)}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
                  {r.departureTime} 출발
                  {r.returnTime ? ` ~ ${r.returnTime} 귀항` : ''}
                </div>
                {r.status === 'rejected' && r.rejectedReason && (
                  <div
                    className="mt-2 px-2 py-1 rounded-2"
                    style={{ fontSize: 12, color: '#6F767E', backgroundColor: '#F7F8FA', fontFamily: FONT }}
                  >
                    사유: {r.rejectedReason}
                  </div>
                )}
                {canCancel && (
                  <button
                    type="button"
                    className="btn btn-sm mt-3 w-100"
                    style={{
                      border: '1px solid #EFEFEF',
                      backgroundColor: '#FFFFFF',
                      color: '#6F767E',
                      fontFamily: FONT,
                      fontWeight: 600,
                      borderRadius: 10,
                    }}
                    onClick={() => setCancelTarget(r)}
                  >
                    예약 취소
                  </button>
                )}
                {r.status === 'cancelled' && (
                  <button
                    type="button"
                    className="btn btn-sm mt-3 w-100"
                    style={{
                      border: '1px solid #EFEFEF',
                      backgroundColor: '#FFFFFF',
                      color: '#FF3B30',
                      fontFamily: FONT,
                      fontWeight: 600,
                      borderRadius: 10,
                    }}
                    onClick={() => setDeleteTarget(r)}
                  >
                    내역 삭제
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <OhgoModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="예약 취소"
        footer={
          <>
            <OhgoModalButton variant="secondary" onClick={() => setCancelTarget(null)}>
              닫기
            </OhgoModalButton>
            <OhgoModalButton variant="danger" disabled={cancelling} onClick={() => void handleCancel()}>
              {cancelling ? '처리 중...' : '취소하기'}
            </OhgoModalButton>
          </>
        }
      >
        {cancelTarget && (
          <p className="mb-0" style={{ fontSize: 14, color: '#1A1D1F', fontFamily: FONT, lineHeight: 1.6 }}>
            <strong>{cancelTarget.destination}</strong>
            <br />
            {formatTripDate(cancelTarget.tripDate)} 예약을 취소하시겠습니까?
          </p>
        )}
      </OhgoModal>

      <OhgoModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="내역 삭제"
        footer={
          <>
            <OhgoModalButton variant="secondary" onClick={() => setDeleteTarget(null)}>
              닫기
            </OhgoModalButton>
            <OhgoModalButton variant="danger" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? '처리 중...' : '삭제하기'}
            </OhgoModalButton>
          </>
        }
      >
        {deleteTarget && (
          <p className="mb-0" style={{ fontSize: 14, color: '#1A1D1F', fontFamily: FONT, lineHeight: 1.6 }}>
            <strong>{deleteTarget.destination}</strong>
            <br />
            {formatTripDate(deleteTarget.tripDate)} 취소된 예약 내역을 삭제하시겠습니까?
            <br />
            <span style={{ fontSize: 13, color: '#6F767E' }}>삭제 후에는 복구할 수 없습니다.</span>
          </p>
        )}
      </OhgoModal>
    </SubPageFrame>
  );
}
