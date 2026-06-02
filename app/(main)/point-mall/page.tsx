'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser } from '@/lib/storage';
import SubPageFrame from '@/components/SubPageFrame';
import ProductGridCard from '@/components/home/ProductGridCard';
import EmptyState from '@/components/EmptyState';
import { getPointMallProducts, getUserPointBalance } from '@/utils/point-mall-service';
import type { PointMallProduct } from '@/constants/point-mall';
import { formatPointPrice, getProductPrimaryImageUrl } from '@/constants/point-mall';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import {
  IoGameControllerOutline,
  IoChatbubblesOutline,
  IoStorefrontOutline,
  IoReceiptOutline,
  IoChevronForwardOutline,
} from 'react-icons/io5';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";

function PointMallPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const baitFilter = searchParams.get('filter') === 'bait';
  const [ready, setReady] = useState(false);
  const [uuid, setUuid] = useState('');
  const [products, setProducts] = useState<PointMallProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [gamePoints, setGamePoints] = useState(0);
  const [communityPoints, setCommunityPoints] = useState(0);

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

  if (!ready) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  const totalPoints = gamePoints + communityPoints;
  const displayProducts = baitFilter
    ? products.filter(p => p.isBaitProduct === true)
    : products;

  return (
    <SubPageFrame title={baitFilter ? '미끼 구매' : 'Oh~Go! 포인트몰'}>
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

      {baitFilter ? (
        <p className="mb-3" style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
          커뮤니티 포인트로 미끼를 구매한 뒤 미니게임을 플레이할 수 있습니다. 게임 포인트는 사용할 수
          없습니다.
        </p>
      ) : (
        <p className="mb-3" style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
          미니게임·커뮤니티 활동으로 적립한 포인트로 상품을 구매할 수 있습니다.
        </p>
      )}

      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : displayProducts.length === 0 ? (
        <EmptyState
          icon={IoStorefrontOutline}
          message={baitFilter ? '등록된 미끼 상품이 없습니다.' : '등록된 상품이 없습니다.'}
          style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        />
      ) : (
        <div className="row g-3">
          {displayProducts.map(product => {
            const outOfStock = product.stock === 0;
            return (
              <div key={product.id} className="col-6">
                <ProductGridCard
                  product={{
                    id: product.id,
                    name: product.name,
                    price: outOfStock ? '품절' : formatPointPrice(product.pointPrice),
                    imageUrl: getProductPrimaryImageUrl(product),
                    memberOnly: false,
                  }}
                  onClick={() =>
                    router.push(`/point-mall/product?id=${encodeURIComponent(product.id)}`)
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </SubPageFrame>
  );
}

export default function PointMallPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-vh-100 d-flex align-items-center justify-content-center"
          style={{ backgroundColor: '#F7F8FA' }}
        >
          <div className="spinner-border text-primary" role="status" />
        </div>
      }
    >
      <PointMallPageContent />
    </Suspense>
  );
}
