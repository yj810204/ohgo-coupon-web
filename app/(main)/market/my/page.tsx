'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { ohgoConfirm } from '@/lib/ohgo-dialog';
import {
  deleteMyListing,
  formatMarketCreatedAt,
  formatMarketPrice,
  getMyListings,
  marketCategoryLabel,
  markAsSold,
  MARKET_STATUS_LABELS,
  type MarketListing,
  type MarketStatus,
} from '@/utils/market-service';
import StorageThumb from '@/components/StorageThumb';
import { useNavigation } from '@/hooks/useNavigation';
import { OHGO_CARD, OHGO_FONT, OHGO_LIST_DIVIDER } from '@/lib/page-styles';
import { IoStorefrontOutline } from 'react-icons/io5';
import { writeHeaderAction } from '@/lib/page-header-action';

const FONT = OHGO_FONT;

function statusStyle(status: MarketStatus): React.CSSProperties {
  switch (status) {
    case 'pending':
      return { backgroundColor: '#FFF8E6', color: '#E65100' };
    case 'approved':
      return { backgroundColor: '#E8F8EE', color: '#2E7D32' };
    case 'rejected':
      return { backgroundColor: '#FFEBEA', color: '#FF3B30' };
    case 'sold':
      return { backgroundColor: '#F2F3F5', color: '#6F767E' };
    default:
      return { backgroundColor: '#F2F3F5', color: '#6F767E' };
  }
}

export default function MyMarketListingsPage() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const [userId, setUserId] = useState('');
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async (uuid: string) => {
    setLoading(true);
    try {
      setListings(await getMyListings(uuid));
    } catch (error) {
      console.error(error);
      alert('판매글을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const user = await resolveAppUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      setUserId(user.uuid);
      await load(user.uuid);
    };
    void init();
  }, [router, load]);

  const handleSold = async (id: string) => {
    if (!(await ohgoConfirm('이 상품을 판매완료로 처리할까요?'))) return;
    setActingId(id);
    try {
      await markAsSold(id);
      await load(userId);
    } catch (error) {
      alert(error instanceof Error ? error.message : '처리에 실패했습니다.');
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await ohgoConfirm('이 판매글을 삭제할까요?'))) return;
    setActingId(id);
    try {
      await deleteMyListing(id);
      await load(userId);
    } catch (error) {
      alert(error instanceof Error ? error.message : '삭제에 실패했습니다.');
    } finally {
      setActingId(null);
    }
  };

  return (
    <SubPageFrame
      title="판매관리"
      onRefresh={() => (userId ? load(userId) : undefined)}
      onBack={() => router.replace('/market')}
      headerAction={writeHeaderAction(() => navigate('/market/sell'), '판매 등록')}
    >
      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={IoStorefrontOutline}
          message="등록한 판매글이 없습니다."
          style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        />
      ) : (
        <div style={OHGO_CARD}>
          {listings.map((listing, index) => {
            const busy = actingId === listing.id;
            const createdLabel = formatMarketCreatedAt(listing.createdAt);
            const canEdit = listing.status === 'pending' || listing.status === 'rejected' || listing.status === 'approved';
            const canDelete = listing.status === 'pending' || listing.status === 'rejected';
            return (
              <div key={listing.id}>
                {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
                <div style={{ padding: '14px 16px' }}>
                  <button
                    type="button"
                    className="btn w-100 p-0 border-0 text-start d-flex gap-3"
                    onClick={() => navigate(`/market/${listing.id}`)}
                  >
                    <StorageThumb url={listing.imageUrls[0]} alt={listing.title} />
                    <div className="flex-grow-1 min-w-0">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span
                          className="text-truncate flex-grow-1"
                          style={{ fontSize: 14, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}
                        >
                          {listing.title}
                        </span>
                        <span
                          className="badge rounded-pill flex-shrink-0"
                          style={{ ...statusStyle(listing.status), fontSize: 10, fontWeight: 700 }}
                        >
                          {MARKET_STATUS_LABELS[listing.status]}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#1B6FF5', fontWeight: 700, fontFamily: FONT }}>
                        {formatMarketPrice(listing.price)}
                      </div>
                      <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 4 }}>
                        {[marketCategoryLabel(listing.category), createdLabel].filter(Boolean).join(' | ')}
                      </div>
                    </div>
                  </button>
                  {listing.status === 'rejected' && listing.rejectReason ? (
                    <p style={{ fontSize: 12, color: '#FF3B30', fontFamily: FONT, margin: '8px 0 0' }}>
                      반려 사유: {listing.rejectReason}
                    </p>
                  ) : null}
                  <div className="d-flex gap-2 mt-3">
                    {canEdit ? (
                      <button
                        type="button"
                        className="btn flex-grow-1"
                        style={{
                          backgroundColor: '#EBF1FE',
                          color: '#1B6FF5',
                          border: 'none',
                          borderRadius: 10,
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: FONT,
                        }}
                        disabled={busy}
                        onClick={() => navigate(`/market/sell?id=${listing.id}`)}
                      >
                        수정
                      </button>
                    ) : null}
                    {listing.status === 'approved' ? (
                      <button
                        type="button"
                        className="btn flex-grow-1"
                        style={{
                          backgroundColor: '#E8F8EE',
                          color: '#2E7D32',
                          border: 'none',
                          borderRadius: 10,
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: FONT,
                        }}
                        disabled={busy}
                        onClick={() => void handleSold(listing.id)}
                      >
                        판매완료
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="btn flex-grow-1"
                        style={{
                          backgroundColor: '#FFF0F0',
                          color: '#FF3B30',
                          border: 'none',
                          borderRadius: 10,
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: FONT,
                        }}
                        disabled={busy}
                        onClick={() => void handleDelete(listing.id)}
                      >
                        삭제
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SubPageFrame>
  );
}
