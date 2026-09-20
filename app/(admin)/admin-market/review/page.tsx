'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { useRequireAdmin } from '@/hooks/useRequireAdmin';
import SubPageFrame from '@/components/SubPageFrame';
import ImageSwipeSlider from '@/components/ImageSwipeSlider';
import {
  approveListing,
  deleteMyListing,
  formatMarketPrice,
  getListing,
  hideListing,
  MARKET_GRADES,
  MARKET_STATUS_LABELS,
  marketCategoryLabel,
  marketGradeLabel,
  marketStatusStyle,
  marketTradeMethodLabel,
  rejectListing,
  unhideListing,
  type MarketConditionGrade,
  type MarketListing,
} from '@/utils/market-service';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OhgoPageLoading,
} from '@/lib/page-styles';
import { ohgoAlert, ohgoConfirm } from '@/lib/ohgo-dialog';

const FONT = OHGO_FONT;

function AdminMarketReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get('id');
  const { ready, user } = useRequireAdmin();
  const [listing, setListing] = useState<MarketListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [grade, setGrade] = useState<MarketConditionGrade>('mid');
  const [note, setNote] = useState('');
  const [inspectedInPerson, setInspectedInPerson] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!ready) return;
    const init = async () => {
      if (!listingId) {
        router.replace('/admin-market');
        return;
      }
      try {
        const data = await getListing(listingId);
        if (!data) {
          alert('판매글을 찾을 수 없습니다.');
          router.replace('/admin-market');
          return;
        }
        setListing(data);
        setGrade(data.adminConditionGrade || data.conditionGrade || 'mid');
        setNote(data.adminNote || '');
        setInspectedInPerson(data.inspectedInPerson);
        setRejectReason(data.rejectReason || '');
      } catch (error) {
        console.error(error);
        alert('판매글을 불러오지 못했습니다.');
        router.replace('/admin-market');
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [ready, listingId, router]);

  const handleApprove = async () => {
    if (!user || !listing) return;
    setActing(true);
    try {
      await approveListing(listing.id, user.uuid, { grade, note: note.trim() || undefined, inspectedInPerson });
      await ohgoAlert('승인되어 게시되었습니다.');
      router.replace('/admin-market');
    } catch (error) {
      await ohgoAlert(error instanceof Error ? error.message : '승인에 실패했습니다.');
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!user || !listing) return;
    if (!rejectReason.trim()) {
      alert('반려 사유를 입력해주세요.');
      return;
    }
    setActing(true);
    try {
      await rejectListing(listing.id, user.uuid, rejectReason.trim());
      await ohgoAlert('반려 처리되었습니다.');
      router.replace('/admin-market');
    } catch (error) {
      await ohgoAlert(error instanceof Error ? error.message : '반려에 실패했습니다.');
    } finally {
      setActing(false);
    }
  };

  const handleHide = async () => {
    if (!user || !listing) return;
    if (!(await ohgoConfirm('이 판매글을 숨길까요? 공개 목록에서 내려갑니다.'))) return;
    setActing(true);
    try {
      await hideListing(listing.id, user.uuid);
      await ohgoAlert('숨김 처리되었습니다.');
      router.replace('/admin-market');
    } catch (error) {
      await ohgoAlert(error instanceof Error ? error.message : '숨김 처리에 실패했습니다.');
    } finally {
      setActing(false);
    }
  };

  const handleUnhide = async () => {
    if (!user || !listing) return;
    if (!(await ohgoConfirm('이 판매글을 다시 게시할까요? 중고장터 목록에 다시 보입니다.'))) return;
    setActing(true);
    try {
      await unhideListing(listing.id, user.uuid);
      await ohgoAlert('숨김이 해제되어 다시 게시되었습니다.');
      router.replace('/admin-market');
    } catch (error) {
      await ohgoAlert(error instanceof Error ? error.message : '숨김 해제에 실패했습니다.');
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async () => {
    if (!listing) return;
    if (!(await ohgoConfirm('이 판매글을 삭제할까요? 삭제하면 복구할 수 없습니다.'))) return;
    setActing(true);
    try {
      await deleteMyListing(listing.id);
      await ohgoAlert('삭제되었습니다.');
      router.replace('/admin-market');
    } catch (error) {
      await ohgoAlert(error instanceof Error ? error.message : '삭제에 실패했습니다.');
    } finally {
      setActing(false);
    }
  };

  if (!ready || loading) return <OhgoPageLoading />;
  if (!listing) return null;

  return (
    <SubPageFrame title="중고장터 검수" onBack={() => router.replace('/admin-market')}>
      {listing.status === 'hidden' ? (
        <div
          style={{
            ...OHGO_CARD,
            padding: 14,
            marginBottom: 12,
            backgroundColor: '#F8F1FF',
          }}
        >
          <p style={{ fontSize: 12, color: '#7B1FA2', fontFamily: FONT, margin: 0, lineHeight: 1.55 }}>
            강제 숨김 상태입니다. 공개 중고장터에는 보이지 않습니다. 숨김 해제하면 판매중으로 다시 게시됩니다.
          </p>
        </div>
      ) : null}

      <div className="mb-3" style={OHGO_CARD}>
        <div style={{ overflow: 'hidden', borderRadius: '16px 16px 0 0' }}>
          <ImageSwipeSlider urls={listing.imageUrls} alt={listing.title} />
        </div>
        <div style={{ padding: 16 }}>
          <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
            <span
              className="badge rounded-pill"
              style={{ ...marketStatusStyle(listing.status), fontSize: 11, fontWeight: 700 }}
            >
              {MARKET_STATUS_LABELS[listing.status]}
            </span>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT, margin: 0 }}>
            {listing.title}
          </h1>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1B6FF5', fontFamily: FONT, marginTop: 8 }}>
            {formatMarketPrice(listing.price)}
          </div>
          <p style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, margin: '10px 0 0' }}>
            {[
              listing.sellerName,
              marketCategoryLabel(listing.category),
              listing.conditionGrade ? `상태 ${marketGradeLabel(listing.conditionGrade)}` : '',
            ]
              .filter(Boolean)
              .join(' | ')}
          </p>
          {listing.contactPhone ? (
            <p style={{ fontSize: 13, color: '#1A1D1F', fontFamily: FONT, margin: '8px 0 0' }}>
              연락처 {listing.contactPhone}
            </p>
          ) : null}
          {marketTradeMethodLabel(listing.tradeArea) ? (
            <p style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, margin: '4px 0 0' }}>
              {marketTradeMethodLabel(listing.tradeArea)}
            </p>
          ) : null}
        </div>
      </div>

      <div style={{ ...OHGO_CARD, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, marginBottom: 8 }}>
          상품 설명
        </div>
        <p style={{ fontSize: 14, color: '#1A1D1F', fontFamily: FONT, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {listing.description || '설명이 없습니다.'}
        </p>
      </div>

      <div style={{ ...OHGO_CARD, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, marginBottom: 10 }}>
          검수 기록
        </div>
        <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginBottom: 8 }}>관리자 확정 등급</div>
        <div className="d-flex gap-2 mb-3">
          {MARKET_GRADES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGrade(item.id)}
              className="btn flex-grow-1"
              style={{
                borderRadius: 10,
                border: 'none',
                padding: '8px 10px',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: FONT,
                backgroundColor: grade === item.id ? '#EBF1FE' : '#F2F3F5',
                color: grade === item.id ? '#1B6FF5' : '#6F767E',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="d-flex align-items-center gap-2 mb-3" style={{ fontSize: 13, fontFamily: FONT }}>
          <input
            type="checkbox"
            checked={inspectedInPerson}
            onChange={(e) => setInspectedInPerson(e.target.checked)}
          />
          실물 확인 완료
        </label>
        <label style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, display: 'block', marginBottom: 6 }}>
          검수 메모
        </label>
        <textarea
          className="form-control"
          style={{ ...OHGO_INPUT, minHeight: 80 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="상태, 하자, 확인 내용 등"
          disabled={acting}
        />
      </div>

      <div style={{ ...OHGO_CARD, padding: 16, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, display: 'block', marginBottom: 6 }}>
          반려 사유
        </label>
        <textarea
          className="form-control"
          style={{ ...OHGO_INPUT, minHeight: 72 }}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="반려 시 판매자에게 전달됩니다."
          disabled={acting}
        />
      </div>

      <div className="d-grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button
          type="button"
          className={`btn fw-semibold ${OHGO_DISMISS_BTN_CLASS}`}
          style={OHGO_DISMISS_BTN}
          disabled={acting}
          onClick={() => void handleReject()}
        >
          반려
        </button>
        <button
          type="button"
          className={`btn fw-semibold ${OHGO_CONFIRM_BTN_CLASS}`}
          style={OHGO_CONFIRM_BTN}
          disabled={acting}
          onClick={() => void handleApprove()}
        >
          승인
        </button>
      </div>
      {listing.status === 'approved' ? (
        <button
          type="button"
          className="btn w-100 mt-2"
          style={{
            backgroundColor: '#F2F3F5',
            color: '#6F767E',
            border: 'none',
            borderRadius: 12,
            padding: 12,
            fontWeight: 700,
            fontFamily: FONT,
          }}
          disabled={acting}
          onClick={() => void handleHide()}
        >
          강제 숨김
        </button>
      ) : null}
      {listing.status === 'hidden' ? (
        <button
          type="button"
          className="btn w-100 mt-2"
          style={{
            backgroundColor: '#F3E8FF',
            color: '#7B1FA2',
            border: 'none',
            borderRadius: 12,
            padding: 12,
            fontWeight: 700,
            fontFamily: FONT,
          }}
          disabled={acting}
          onClick={() => void handleUnhide()}
        >
          숨김 해제
        </button>
      ) : null}
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
    </SubPageFrame>
  );
}

export default function AdminMarketReviewPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <AdminMarketReviewContent />
    </Suspense>
  );
}
