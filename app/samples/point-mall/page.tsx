'use client';

import { useRouter } from '@/hooks/useAppRouter';
import {
  IoGameControllerOutline,
  IoChatbubblesOutline,
  IoReceiptOutline,
  IoChevronForwardOutline,
} from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import ProductGridCard from '@/components/home/ProductGridCard';
import { SAMPLE_MALL_PRODUCTS, SAMPLE_POINT_BALANCE } from '@/lib/samples/mock-data';

const FONT = "var(--font-ohgo), sans-serif";

export default function SamplePointMallPage() {
  const router = useRouter();
  const { gamePoints, communityPoints } = SAMPLE_POINT_BALANCE;
  const totalPoints = gamePoints + communityPoints;

  return (
    <SubPageFrame
      title="Oh~Go! 포인트몰"
      showMyPage={false}
      onBack={() => router.push('/samples/main')}
    >
      <div className="point-mall-balance" style={{ fontFamily: FONT }}>
        <div className="point-mall-balance__row">
          <div className="point-mall-balance__points">
            <div className="point-mall-balance__label">사용 가능 포인트</div>
            <div className="point-mall-balance__total">
              {totalPoints.toLocaleString('ko-KR')}P
            </div>
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
            className="point-mall-balance__orders-btn"
            style={{ fontFamily: FONT }}
          >
            <IoReceiptOutline size={18} aria-hidden className="point-mall-balance__orders-btn-icon" />
            <span className="point-mall-balance__orders-btn-label">구매 내역</span>
            <IoChevronForwardOutline size={14} aria-hidden className="point-mall-balance__orders-btn-chevron" />
          </button>
        </div>
      </div>

      <p className="mb-3" style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
        미니게임·커뮤니티 활동으로 적립한 포인트로 상품을 구매할 수 있습니다.
      </p>

      <div className="row g-3">
        {SAMPLE_MALL_PRODUCTS.map((product) => (
          <div key={product.id} className="col-6">
            <ProductGridCard
              product={{
                id: product.id,
                name: product.name,
                price: product.price,
                memberOnly: false,
              }}
            />
          </div>
        ))}
      </div>
    </SubPageFrame>
  );
}
