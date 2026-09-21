'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import SubPageFrame from '@/components/SubPageFrame';
import ImageSwipeSlider from '@/components/ImageSwipeSlider';
import {
  canSellerDeleteListing,
  deleteMyListing,
  formatMarketPrice,
  getListing,
  incrementViewCount,
  isForceHiddenListing,
  MARKET_STATUS_LABELS,
  marketCategoryLabel,
  marketGradeLabel,
  marketStatusStyle,
  marketTradeMethodLabel,
  type MarketListing,
} from '@/utils/market-service';
import { displayMemberName } from '@/lib/mask-member-name';
import { formatPhotoCardDate } from '@/lib/mask-member-name';
import { ohgoConfirm } from '@/lib/ohgo-dialog';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OhgoPageLoading,
} from '@/lib/page-styles';
import { IoCallOutline, IoShieldCheckmarkOutline } from 'react-icons/io5';
import { openPhoneDialer } from '@/lib/native-bridge';

const FONT = OHGO_FONT;

export default function MarketListingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const listingId = params?.listingId as string;
  const [listing, setListing] = useState<MarketListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [canSeeFullNames, setCanSeeFullNames] = useState(false);
  const [viewer, setViewer] = useState<{ uuid: string; isAdmin: boolean } | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const init = async () => {
      const user = await resolveAppUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      setViewer({ uuid: user.uuid, isAdmin: Boolean(user.isAdmin) });
      setCanSeeFullNames(Boolean(user.isAdmin || user.isCaptain));
      if (!listingId) return;
      try {
        const data = await getListing(listingId);
        if (!data) {
          alert('상품을 찾을 수 없습니다.');
          router.replace('/market');
          return;
        }
        setListing(data);
        if (data.status === 'approved' || data.status === 'sold') {
          void incrementViewCount(data.id);
        }
      } catch (error) {
        console.error(error);
        alert('상품을 불러오지 못했습니다.');
        router.replace('/market');
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [listingId, router]);

  const handleDelete = async () => {
    if (!listing) return;
    if (!(await ohgoConfirm('이 판매글을 삭제할까요? 삭제하면 복구할 수 없습니다.'))) return;
    setActing(true);
    try {
      await deleteMyListing(listing.id);
      const owner = viewer?.uuid === listing.sellerId;
      router.replace(owner ? '/market/my' : viewer?.isAdmin ? '/admin-market' : '/market');
    } catch (error) {
      alert(error instanceof Error ? error.message : '삭제에 실패했습니다.');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <OhgoPageLoading />;
  if (!listing) return null;

  const sold = listing.status === 'sold';
  const forceHidden = isForceHiddenListing(listing.status);
  const isOwner = Boolean(viewer?.uuid && viewer.uuid === listing.sellerId);
  const canManage = Boolean(isOwner || viewer?.isAdmin);
  const canDelete = canManage && canSellerDeleteListing();
  const showStatusBanner = canManage && listing.status !== 'approved';
  const grade = listing.adminConditionGrade || listing.conditionGrade;
  const phone = listing.contactPhone?.trim();
  const showCallSeller = Boolean(phone) && listing.status === 'approved';

  return (
    <SubPageFrame title="중고장터" onBack={() => router.replace('/market')}>
      <div className="mb-3" style={OHGO_CARD}>
        <div style={{ overflow: 'hidden', borderRadius: '16px 16px 0 0', position: 'relative' }}>
          <ImageSwipeSlider urls={listing.imageUrls} alt={listing.title} />
          {sold || forceHidden ? (
            <div
              className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
              style={{ backgroundColor: 'rgba(26,29,31,0.45)' }}
            >
              <span
                style={{
                  backgroundColor: '#1A1D1F',
                  color: '#fff',
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 14,
                  borderRadius: 999,
                  padding: '8px 16px',
                }}
              >
                {forceHidden ? '강제숨김' : '판매완료'}
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ padding: 16 }}>
          <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
            {showStatusBanner ? (
              <span
                className="badge rounded-pill"
                style={{ ...marketStatusStyle(listing.status), fontSize: 11, fontWeight: 700 }}
              >
                {MARKET_STATUS_LABELS[listing.status]}
              </span>
            ) : null}
            <span
              className="badge rounded-pill"
              style={{ backgroundColor: '#F2F3F5', color: '#6F767E', fontSize: 11, fontWeight: 700 }}
            >
              {marketCategoryLabel(listing.category)}
            </span>
            {grade ? (
              <span
                className="badge rounded-pill"
                style={{ backgroundColor: '#EBF1FE', color: '#1B6FF5', fontSize: 11, fontWeight: 700 }}
              >
                상태 {marketGradeLabel(grade)}
              </span>
            ) : null}
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT, margin: 0 }}>
            {listing.title}
          </h1>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1B6FF5', fontFamily: FONT, marginTop: 8 }}>
            {formatMarketPrice(listing.price)}
          </div>
          <p style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, margin: '10px 0 0' }}>
            {[
              displayMemberName(listing.sellerName, canSeeFullNames),
              marketTradeMethodLabel(listing.tradeArea),
              formatPhotoCardDate(listing.createdAt),
            ]
              .filter(Boolean)
              .join(' | ')}
          </p>
        </div>
      </div>

      {listing.inspectedInPerson || listing.adminNote || listing.adminConditionGrade ? (
        <div style={{ ...OHGO_CARD, padding: 16, marginBottom: 12 }}>
          <div className="d-flex align-items-center gap-2 mb-2">
            <IoShieldCheckmarkOutline size={18} color="#2E7D32" />
            <strong style={{ fontSize: 14, fontFamily: FONT, color: '#1A1D1F' }}>오고피씽 검수</strong>
          </div>
          {listing.inspectedInPerson ? (
            <p style={{ fontSize: 13, color: '#2E7D32', fontFamily: FONT, marginBottom: 6, fontWeight: 700 }}>
              실물 확인 완료
            </p>
          ) : null}
          {listing.adminConditionGrade ? (
            <p style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginBottom: 6 }}>
              검수 등급: {marketGradeLabel(listing.adminConditionGrade)}
            </p>
          ) : null}
          {listing.adminNote ? (
            <p style={{ fontSize: 13, color: '#1A1D1F', fontFamily: FONT, margin: 0, lineHeight: 1.55 }}>
              {listing.adminNote}
            </p>
          ) : null}
        </div>
      ) : null}

      <div style={{ ...OHGO_CARD, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, marginBottom: 8 }}>
          상품 설명
        </div>
        <p style={{ fontSize: 14, color: '#1A1D1F', fontFamily: FONT, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {listing.description || '설명이 없습니다.'}
        </p>
      </div>

      <div
        style={{
          ...OHGO_CARD,
          padding: 14,
          marginBottom: 16,
          backgroundColor: '#FFF8E6',
        }}
      >
        <p style={{ fontSize: 12, color: '#8A5A00', fontFamily: FONT, margin: 0, lineHeight: 1.55 }}>
          거래 시 사기·불량 상품에 주의하세요. 앱은 중개만 하며 금전 거래와 배송은 당사자 책임입니다.
          의심스러운 거래는 관리자에게 알려주세요.
        </p>
      </div>

      {forceHidden && canManage ? (
        <div
          style={{
            ...OHGO_CARD,
            padding: 14,
            marginBottom: 12,
            backgroundColor: '#F8F1FF',
          }}
        >
          <p style={{ fontSize: 12, color: '#7B1FA2', fontFamily: FONT, margin: 0, lineHeight: 1.55 }}>
            관리자가 강제 숨김한 상품입니다. 공개 중고장터에는 보이지 않습니다.
            {isOwner ? ' 판매관리에서 삭제할 수 있습니다.' : ' 숨김 해제 또는 삭제는 중고장터 관리에서 할 수 있습니다.'}
          </p>
        </div>
      ) : null}

      {showCallSeller ? (
        <button
          type="button"
          className={`btn w-100 fw-semibold d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
          style={{ ...OHGO_CONFIRM_BTN, textDecoration: 'none' }}
          onClick={() => {
            if (!phone || !openPhoneDialer(phone)) {
              alert('등록된 연락처가 올바르지 않습니다.');
            }
          }}
        >
          <IoCallOutline size={18} />
          판매자에게 전화하기
        </button>
      ) : sold ? (
        <div
          className="text-center"
          style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, padding: 12 }}
        >
          거래가 완료된 상품입니다.
        </div>
      ) : null}

      {canDelete ? (
        <button
          type="button"
          className="btn w-100 mt-2"
          style={{
            backgroundColor: '#FFF0F0',
            color: '#FF3B30',
            border: 'none',
            borderRadius: 12,
            padding: 12,
            fontWeight: 700,
            fontFamily: FONT,
          }}
          disabled={acting}
          onClick={() => void handleDelete()}
        >
          판매글 삭제
        </button>
      ) : null}
    </SubPageFrame>
  );
}
