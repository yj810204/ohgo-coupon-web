'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import {
  adminCancelReservation,
  adminDeleteCancelledReservation,
  approveReservation,
  getAllReservations,
  rejectReservation,
  reservationStatusLabel,
  type TripReservation,
  type TripReservationStatus,
} from '@/utils/reservation-service';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { OhgoPageLoading, OHGO_CARD, OHGO_FONT } from '@/lib/page-styles';
import { IoCalendarOutline } from 'react-icons/io5';

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const FILTERS: { id: 'all' | TripReservationStatus; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'pending', label: '대기' },
  { id: 'confirmed', label: '확정' },
  { id: 'rejected', label: '거절' },
  { id: 'cancelled', label: '취소' },
];

function formatTripDate(dateStr: string) {
  const m = parseInt(dateStr.split('-')[1], 10);
  const d = parseInt(dateStr.split('-')[2], 10);
  const weekday = DAY_LABELS[new Date(`${dateStr}T12:00:00`).getDay()];
  return `${m}/${d} (${weekday})`;
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

export default function AdminReservationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<TripReservation[]>([]);
  const [filter, setFilter] = useState<'all' | TripReservationStatus>('all');
  const [rejectTarget, setRejectTarget] = useState<TripReservation | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await getAllReservations();
      setReservations(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const check = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      const remote = await getUserByUUID(user.uuid);
      if (!remote?.isAdmin) {
        router.replace('/main');
        return;
      }
      await load();
    };
    void check();
  }, [router]);

  useNativePullToRefresh(load);

  const filtered = useMemo(() => {
    if (filter === 'all') return reservations;
    return reservations.filter(r => r.status === filter);
  }, [reservations, filter]);

  const handleApprove = async (id: string) => {
    setActing(true);
    try {
      const ok = await approveReservation(id);
      if (!ok) alert('승인할 수 없습니다. (이미 처리됨 또는 정원 마감)');
      await load();
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActing(true);
    try {
      const ok = await rejectReservation(rejectTarget.id, rejectReason);
      if (!ok) alert('거절할 수 없습니다.');
      else {
        setRejectTarget(null);
        setRejectReason('');
        await load();
      }
    } finally {
      setActing(false);
    }
  };

  const handleAdminCancel = async (id: string) => {
    if (!confirm('이 예약을 취소 처리하시겠습니까?')) return;
    setActing(true);
    try {
      await adminCancelReservation(id);
      await load();
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('취소된 예약 내역을 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.')) return;
    setActing(true);
    try {
      const ok = await adminDeleteCancelledReservation(id);
      if (!ok) alert('삭제할 수 없는 내역입니다.');
      else await load();
    } finally {
      setActing(false);
    }
  };

  if (loading) return <OhgoPageLoading />;

  return (
    <SubPageFrame title="예약 관리" onRefresh={load}>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            className="btn btn-sm rounded-pill"
            style={{
              border: 'none',
              backgroundColor: filter === f.id ? '#237FFF' : '#F2F3F5',
              color: filter === f.id ? '#FFFFFF' : '#6F767E',
              fontFamily: FONT,
              fontWeight: 600,
              fontSize: 12,
              padding: '6px 12px',
            }}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={IoCalendarOutline} message="예약이 없습니다." style={CARD} />
      ) : (
        <div className="d-flex flex-column gap-3">
          {filtered.map(r => (
            <div key={r.id} className="p-3" style={CARD}>
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                    {r.destination}
                  </div>
                  <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>
                    {formatTripDate(r.tripDate)} · {r.departureTime} 출발
                  </div>
                </div>
                <span
                  className="badge rounded-pill flex-shrink-0"
                  style={{ ...statusBadgeStyle(r.status), fontSize: 11, fontWeight: 700 }}
                >
                  {reservationStatusLabel(r.status)}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>{r.userName}</div>
              <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>{r.userPhone}</div>
              {r.rejectedReason && (
                <div className="mt-2" style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>
                  거절 사유: {r.rejectedReason}
                </div>
              )}
              {r.status === 'pending' && (
                <div className="d-flex gap-2 mt-3">
                  <button
                    type="button"
                    className="btn btn-sm flex-grow-1"
                    disabled={acting}
                    style={{ backgroundColor: '#34C759', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600 }}
                    onClick={() => void handleApprove(r.id)}
                  >
                    승인
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm flex-grow-1"
                    disabled={acting}
                    style={{ backgroundColor: '#FF3B30', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600 }}
                    onClick={() => {
                      setRejectTarget(r);
                      setRejectReason('');
                    }}
                  >
                    거절
                  </button>
                </div>
              )}
              {(r.status === 'pending' || r.status === 'confirmed') && (
                <button
                  type="button"
                  className="btn btn-sm w-100 mt-2"
                  disabled={acting}
                  style={{ border: '1px solid #EFEFEF', backgroundColor: '#fff', color: '#6F767E', borderRadius: 10 }}
                  onClick={() => void handleAdminCancel(r.id)}
                >
                  예약 취소 처리
                </button>
              )}
              {r.status === 'cancelled' && (
                <button
                  type="button"
                  className="btn btn-sm w-100 mt-2"
                  disabled={acting}
                  style={{ border: '1px solid #EFEFEF', backgroundColor: '#fff', color: '#FF3B30', borderRadius: 10, fontWeight: 600 }}
                  onClick={() => void handleDelete(r.id)}
                >
                  내역 삭제
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <OhgoModal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="예약 거절"
        footer={
          <>
            <OhgoModalButton variant="secondary" onClick={() => setRejectTarget(null)}>
              닫기
            </OhgoModalButton>
            <OhgoModalButton variant="danger" disabled={acting} onClick={() => void handleReject()}>
              {acting ? '처리 중...' : '거절'}
            </OhgoModalButton>
          </>
        }
      >
        {rejectTarget && (
          <>
            <p className="mb-2" style={{ fontSize: 14, fontFamily: FONT }}>
              {rejectTarget.userName} · {rejectTarget.destination}
            </p>
            <label style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>거절 사유 (선택)</label>
            <input
              type="text"
              className="form-control"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="사유 입력"
              style={{ fontFamily: FONT }}
            />
          </>
        )}
      </OhgoModal>
    </SubPageFrame>
  );
}
