'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser } from '@/lib/storage';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import {
  formatPointPrice,
  formatProductStock,
  getProductImageUrls,
  purchaseErrorMessage,
  type PointMallProduct,
} from '@/constants/point-mall';
import {
  getPointMallProductById,
  getUserPointBalance,
  purchaseProduct,
} from '@/utils/point-mall-service';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OhgoPageLoading,
} from '@/lib/page-styles';
import {
  IoChatbubblesOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoGameControllerOutline,
  IoImageOutline,
} from 'react-icons/io5';

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };

function ProductImageSlider({ images, productName }: { images: string[]; productName: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });
  const [activeIndex, setActiveIndex] = useState(0);

  const syncIndexFromScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth <= 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(Math.min(Math.max(index, 0), Math.max(images.length - 1, 0)));
  }, [images.length]);

  const scrollToIndex = useCallback(
    (index: number, smooth = true) => {
      const el = trackRef.current;
      if (!el) return;
      const next = Math.min(Math.max(index, 0), images.length - 1);
      el.scrollTo({ left: next * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
      setActiveIndex(next);
    },
    [images.length]
  );

  const snapAfterDrag = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth <= 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    scrollToIndex(index);
  }, [scrollToIndex]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || e.button !== 0) return;
    dragRef.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
    el.classList.add('point-mall-product-gallery__track--dragging');
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || !trackRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 4) dragRef.current.moved = true;
    trackRef.current.scrollLeft = dragRef.current.scrollLeft - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || !dragRef.current.active) return;
    dragRef.current.active = false;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    el.classList.remove('point-mall-product-gallery__track--dragging');
    snapAfterDrag();
  };

  const goPrev = () => scrollToIndex(activeIndex - 1);
  const goNext = () => scrollToIndex(activeIndex + 1);

  if (images.length === 0) {
    return (
      <div className="point-mall-product-gallery">
        <div className="point-mall-product-gallery__empty d-flex flex-column align-items-center justify-content-center gap-2">
          <IoImageOutline size={40} />
          <span style={{ fontSize: 13 }}>이미지 없음</span>
        </div>
      </div>
    );
  }

  const hasNav = images.length > 1;

  return (
    <div className="point-mall-product-gallery">
      <div className="point-mall-product-gallery__viewport">
        {hasNav && (
          <>
            <button
              type="button"
              className="point-mall-product-gallery__nav point-mall-product-gallery__nav--prev"
              aria-label="이전 이미지"
              disabled={activeIndex === 0}
              onClick={goPrev}
            >
              <IoChevronBackOutline size={20} />
            </button>
            <button
              type="button"
              className="point-mall-product-gallery__nav point-mall-product-gallery__nav--next"
              aria-label="다음 이미지"
              disabled={activeIndex >= images.length - 1}
              onClick={goNext}
            >
              <IoChevronForwardOutline size={20} />
            </button>
          </>
        )}
        <div
          ref={trackRef}
          className="point-mall-product-gallery__track"
          onScroll={syncIndexFromScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={e => {
            if (dragRef.current.moved) e.preventDefault();
            dragRef.current.moved = false;
          }}
        >
          {images.map((url, index) => (
            <div key={`${url}-${index}`} className="point-mall-product-gallery__slide">
              <img src={url} alt={`${productName} ${index + 1}`} draggable={false} />
            </div>
          ))}
        </div>
      </div>
      {hasNav && (
        <div className="point-mall-product-gallery__dots" role="tablist" aria-label="상품 이미지">
          {images.map((_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={activeIndex === index}
              aria-label={`${index + 1}번째 이미지`}
              className={`point-mall-product-gallery__dot border-0 p-0 ${
                activeIndex === index ? 'point-mall-product-gallery__dot--active' : ''
              }`}
              onClick={() => scrollToIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PointMallProductContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get('id') ?? '';

  const [uuid, setUuid] = useState('');
  const [product, setProduct] = useState<PointMallProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [gamePoints, setGamePoints] = useState(0);
  const [communityPoints, setCommunityPoints] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const load = useCallback(async (userUuid: string, id: string) => {
    setLoading(true);
    try {
      const [p, balance] = await Promise.all([
        getPointMallProductById(id),
        getUserPointBalance(userUuid),
      ]);
      if (!p) {
        alert('상품을 찾을 수 없습니다.');
        router.replace('/point-mall');
        return;
      }
      setProduct(p);
      setGamePoints(balance.gamePoints);
      setCommunityPoints(balance.communityPoints);
    } catch (e) {
      console.error(e);
      alert('상품 정보를 불러오지 못했습니다.');
      router.replace('/point-mall');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const init = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      if (!productId) {
        router.replace('/point-mall');
        return;
      }
      setUuid(user.uuid);
      await load(user.uuid, productId);
    };
    void init();
  }, [productId, router, load]);

  const handlePurchase = async () => {
    if (!product || !uuid) return;
    setPurchasing(true);
    try {
      const result = await purchaseProduct(uuid, product.id);
      if (result.ok) {
        alert('구매가 완료되었습니다.');
        setConfirmOpen(false);
        router.push('/point-mall/orders');
      } else {
        alert(purchaseErrorMessage(result.code));
      }
    } finally {
      setPurchasing(false);
    }
  };

  if (loading || !product) {
    return <OhgoPageLoading />;
  }

  const images = getProductImageUrls(product);
  const totalPoints = gamePoints + communityPoints;
  const outOfStock = product.stock === 0;
  const canPurchase = !outOfStock && totalPoints >= product.pointPrice;

  return (
    <SubPageFrame title="상품 상세" onBack={() => router.back()}>
      <div className="point-mall-product-detail d-flex flex-column gap-3" style={{ fontFamily: FONT }}>
        <ProductImageSlider images={images} productName={product.name} />

        {/* 상품 정보 */}
        <div style={{ ...CARD, padding: 16 }}>
          <h1
            className="mb-2"
            style={{ fontSize: 20, fontWeight: 800, color: '#1A1D1F', lineHeight: 1.35 }}
          >
            {product.name}
          </h1>
          <div
            className="d-flex align-items-center flex-wrap gap-2 mb-3"
            style={{ fontSize: 13, color: '#6F767E' }}
          >
            <span
              className="badge rounded-pill"
              style={{
                backgroundColor: outOfStock ? '#FFF0F0' : '#EBF1FE',
                color: outOfStock ? '#FF3B30' : '#1B6FF5',
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              {formatProductStock(product.stock)}
            </span>
          </div>
          {product.description ? (
            <p className="mb-0" style={{ fontSize: 14, color: '#6F767E', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {product.description}
            </p>
          ) : (
            <p className="mb-0" style={{ fontSize: 14, color: '#9A9FA5' }}>
              상품 설명이 없습니다.
            </p>
          )}
        </div>

        {/* 포인트·가격 */}
        <div style={{ ...CARD, padding: 16 }}>
          <div
            className="d-flex justify-content-between align-items-center p-3 rounded-3 mb-3"
            style={{ backgroundColor: '#EBF1FE' }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1B6FF5' }}>구매 포인트</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#1B6FF5' }}>
              {formatPointPrice(product.pointPrice)}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#6F767E' }}>
            <div className="d-flex justify-content-between mb-1">
              <span>사용 가능 포인트</span>
              <span style={{ fontWeight: 700, color: '#1A1D1F' }}>{totalPoints.toLocaleString('ko-KR')}P</span>
            </div>
            <div className="d-flex flex-wrap gap-3 mt-2" style={{ fontSize: 12, color: '#9A9FA5' }}>
              <span className="d-inline-flex align-items-center gap-1">
                <IoGameControllerOutline size={12} aria-hidden />
                게임 {gamePoints.toLocaleString('ko-KR')}P
              </span>
              <span className="d-inline-flex align-items-center gap-1">
                <IoChatbubblesOutline size={12} aria-hidden />
                커뮤니티 {communityPoints.toLocaleString('ko-KR')}P
              </span>
            </div>
            <p className="mb-0 mt-2" style={{ fontSize: 11, color: '#9A9FA5' }}>
              게임 포인트가 우선 차감됩니다.
            </p>
          </div>
        </div>

        {/* 구매 버튼 */}
        <button
          type="button"
          className={`btn w-100 ${OHGO_CONFIRM_BTN_CLASS}`}
          style={{
            ...OHGO_CONFIRM_BTN,
            opacity: outOfStock ? 0.5 : 1,
          }}
          disabled={outOfStock}
          onClick={() => {
            if (outOfStock) return;
            if (totalPoints < product.pointPrice) {
              alert('포인트가 부족합니다.');
              return;
            }
            setConfirmOpen(true);
          }}
        >
          {outOfStock ? '품절' : '포인트로 구매하기'}
        </button>
        {!outOfStock && totalPoints < product.pointPrice && (
          <p className="text-center mb-0" style={{ fontSize: 12, color: '#FF3B30' }}>
            포인트가 {(product.pointPrice - totalPoints).toLocaleString('ko-KR')}P 부족합니다.
          </p>
        )}
      </div>

      <OhgoModal
        open={confirmOpen}
        onClose={() => {
          if (!purchasing) setConfirmOpen(false);
        }}
        closeOnBackdrop
        title="구매 확인"
        titleTone="brand"
        footerLayout="row"
        footer={
          <>
            <OhgoModalButton variant="secondary" disabled={purchasing} onClick={() => setConfirmOpen(false)}>
              취소
            </OhgoModalButton>
            <OhgoModalButton disabled={purchasing || !canPurchase} onClick={() => void handlePurchase()}>
              {purchasing ? '처리 중...' : '구매하기'}
            </OhgoModalButton>
          </>
        }
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{product.name}</div>
        <div
          className="mt-3 p-3 rounded-3 d-flex justify-content-between align-items-center"
          style={{ backgroundColor: '#EBF1FE' }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1B6FF5', fontFamily: FONT }}>차감 포인트</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#1B6FF5', fontFamily: FONT }}>
            {formatPointPrice(product.pointPrice)}
          </span>
        </div>
        <p className="mt-2 mb-0" style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>
          구매 후 보유 포인트: {(totalPoints - product.pointPrice).toLocaleString('ko-KR')}P
        </p>
      </OhgoModal>
    </SubPageFrame>
  );
}

export default function PointMallProductPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <PointMallProductContent />
    </Suspense>
  );
}
