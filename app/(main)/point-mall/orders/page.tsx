'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { getUser } from '@/lib/storage';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { getMyOrders, type PointMallOrder } from '@/utils/point-mall-service';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { IoReceiptOutline } from 'react-icons/io5';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 14,
  boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
  border: 'none',
};

function orderDate(order: PointMallOrder): string {
  const at = order.purchasedAt;
  const date =
    at instanceof Timestamp
      ? at.toDate()
      : at instanceof Date
        ? at
        : new Date(String(at));
  return format(date, 'yyyy.MM.dd HH:mm');
}

function statusLabel(status: PointMallOrder['status']): string {
  if (status === 'confirmed') return '완료';
  if (status === 'pending') return '대기';
  if (status === 'cancelled') return '취소';
  return status;
}

export default function PointMallOrdersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<PointMallOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async (uuid: string) => {
    setLoading(true);
    try {
      const list = await getMyOrders(uuid);
      setOrders(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const check = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      await loadOrders(user.uuid);
      setReady(true);
    };
    void check();
  }, [router, loadOrders]);

  useNativePullToRefresh(async () => {
    const user = await getUser();
    if (user?.uuid) await loadOrders(user.uuid);
  });

  if (!ready) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <SubPageFrame title="내 구매 내역">
      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={IoReceiptOutline}
          message="구매 내역이 없습니다."
          style={CARD}
        />
      ) : (
        <div className="d-flex flex-column gap-3">
          {orders.map(order => (
            <div key={order.id} className="p-3" style={CARD}>
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                    {order.productName}
                  </div>
                  <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 4 }}>
                    {orderDate(order)}
                  </div>
                </div>
                <span
                  className="badge rounded-pill flex-shrink-0"
                  style={{
                    backgroundColor: order.status === 'confirmed' ? '#EBF1FE' : '#F7F8FA',
                    color: order.status === 'confirmed' ? '#1B6FF5' : '#6F767E',
                    fontSize: 11,
                    fontFamily: FONT,
                  }}
                >
                  {statusLabel(order.status)}
                </span>
              </div>
              <div
                className="mt-2 pt-2 d-flex justify-content-between"
                style={{ borderTop: '1px solid #F7F8FA' }}
              >
                <span style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>사용 포인트</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1B6FF5', fontFamily: FONT }}>
                  {order.pointUsed.toLocaleString('ko-KR')}P
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SubPageFrame>
  );
}
