'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import ProductGridCard from '@/components/home/ProductGridCard';
import EmptyState from '@/components/EmptyState';
import {
  getPointMallProducts,
  getUserPointBalance,
  purchaseProduct,
} from '@/utils/point-mall-service';
import type { PointMallProduct } from '@/constants/point-mall';
import { formatPointPrice } from '@/constants/point-mall';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import {
  IoGameControllerOutline,
  IoChatbubblesOutline,
  IoStorefrontOutline,
  IoReceiptOutline,
  IoChevronForwardOutline,
} from 'react-icons/io5';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";

function purchaseErrorMessage(
  code: 'USER_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'PRODUCT_INACTIVE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_POINTS' | 'UNKNOWN'
): string {
  switch (code) {
    case 'INSUFFICIENT_POINTS':
      return '포인트가 부족합니다.';
    case 'OUT_OF_STOCK':
      return '재고가 없습니다.';
    case 'PRODUCT_INACTIVE':
      return '판매 중지된 상품입니다.';
    case 'PRODUCT_NOT_FOUND':
      return '상품을 찾을 수 없습니다.';
    default:
      return '구매 중 오류가 발생했습니다.';
  }
}

export default function PointMallPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [uuid, setUuid] = useState('');
  const [products, setProducts] = useState<PointMallProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [gamePoints, setGamePoints] = useState(0);
  const [communityPoints, setCommunityPoints] = useState(0);
  const [selected, setSelected] = useState<PointMallProduct | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const loadData = useCallback(async (userUuid: string) => {
    setLoading(true);
    try {
      const [list, balance] = await Promise.all([
        getPointMallProducts(),
        getUserPointBalance(userUuid),
      ]);
      setProducts(list);
      setGamePoints(balance.gamePoints);
      setCommunityPoints(balance.communityPoints);
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
      setUuid(user.uuid);
      await loadData(user.uuid);
      setReady(true);
    };
    void check();
  }, [router, loadData]);

  useNativePullToRefresh(async () => {
    if (uuid) await loadData(uuid);
  });

  const handlePurchase = async () => {
    if (!selected || !uuid) return;
    setPurchasing(true);
    try {
      const result = await purchaseProduct(uuid, selected.id);
      if (result.ok) {
        alert('구매가 완료되었습니다.');
        setSelected(null);
        await loadData(uuid);
      } else {
        alert(purchaseErrorMessage(result.code));
      }
    } finally {
      setPurchasing(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  const totalPoints = gamePoints + communityPoints;

  return (
    <SubPageFrame title="Oh~Go! 포인트몰">
      <div className="point-mall-balance" style={{ fontFamily: FONT }}>
        <div className="point-mall-balance__row">
          <div className="point-mall-balance__points">
            <div className="point-mall-balance__label">사용 가능 포인트</div>
            <div className="point-mall-balance__total">{totalPoints.toLocaleString('ko-KR')}P</div>
            <div className="point-mall-balance__breakdown">
              <span className="d-inline-flex align-items-center gap-1">
                <IoGameControllerOutline size={12} aria-hidden />
                게임 {gamePoints.toLocaleString('ko-KR')}P
              </span>
              <span className="d-inline-flex align-items-center gap-1">
                <IoChatbubblesOutline size={12} aria-hidden />
                커뮤니티 {communityPoints.toLocaleString('ko-KR')}P
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/point-mall/orders')}
            className="btn border-0 point-mall-balance__orders-btn"
            style={{ fontFamily: FONT }}
          >
            <IoReceiptOutline size={20} aria-hidden className="flex-shrink-0" />
            <span>내 구매 내역</span>
            <IoChevronForwardOutline size={16} aria-hidden className="flex-shrink-0" />
          </button>
        </div>
      </div>

      <p className="mb-3" style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
        미니게임·커뮤니티 활동으로 적립한 포인트로 상품을 구매할 수 있습니다.
      </p>

      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={IoStorefrontOutline}
          message="등록된 상품이 없습니다."
          style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        />
      ) : (
        <div className="row g-3">
          {products.map(product => {
            const outOfStock = product.stock === 0;
            return (
              <div key={product.id} className="col-6">
                <ProductGridCard
                  product={{
                    id: product.id,
                    name: product.name,
                    price: outOfStock ? '품절' : formatPointPrice(product.pointPrice),
                    imageUrl: product.imageUrl,
                    memberOnly: false,
                  }}
                  onClick={() => {
                    if (outOfStock) {
                      alert('품절된 상품입니다.');
                      return;
                    }
                    setSelected(product);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      <OhgoModal
        open={!!selected}
        onClose={() => {
          if (!purchasing) setSelected(null);
        }}
        closeOnBackdrop
        title="구매 확인"
        titleTone="brand"
        footerLayout="row"
        footer={
          selected ? (
            <>
              <OhgoModalButton variant="secondary" disabled={purchasing} onClick={() => setSelected(null)}>
                취소
              </OhgoModalButton>
              <OhgoModalButton
                disabled={purchasing || totalPoints < selected.pointPrice}
                onClick={() => void handlePurchase()}
              >
                {purchasing ? '처리 중...' : '구매하기'}
              </OhgoModalButton>
            </>
          ) : null
        }
      >
        {selected && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{selected.name}</div>
            {selected.description && (
              <p style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT, marginTop: 8, marginBottom: 0 }}>
                {selected.description}
              </p>
            )}
            <div
              className="mt-3 p-3 rounded-3 d-flex justify-content-between align-items-center"
              style={{ backgroundColor: '#EBF1FE' }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1B6FF5', fontFamily: FONT }}>차감 포인트</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#1B6FF5', fontFamily: FONT }}>
                {formatPointPrice(selected.pointPrice)}
              </span>
            </div>
            <p className="mt-2 mb-0" style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>
              보유: {totalPoints.toLocaleString('ko-KR')}P (게임 포인트 우선 차감)
            </p>
          </>
        )}
      </OhgoModal>
    </SubPageFrame>
  );
}
