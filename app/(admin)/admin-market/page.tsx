'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { useRequireAdmin } from '@/hooks/useRequireAdmin';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import {
  deleteMyListing,
  getListingsForAdmin,
  hideListing,
  MARKET_STATUS_LABELS,
  formatMarketCreatedAt,
  formatMarketPrice,
  marketCategoryLabel,
  marketStatusStyle,
  unhideListing,
  type MarketListing,
  type MarketStatus,
} from '@/utils/market-service';
import StorageThumb from '@/components/StorageThumb';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { OhgoPageLoading, OHGO_CARD, OHGO_FONT, OHGO_LIST_DIVIDER } from '@/lib/page-styles';
import { IoStorefrontOutline } from 'react-icons/io5';
import { ohgoConfirm } from '@/lib/ohgo-dialog';
import CategoryManager from '@/components/admin/CategoryManager';
import {
  getBoardCategories,
  saveBoardCategories,
  type BoardCategory,
} from '@/utils/board-category-service';

const FONT = OHGO_FONT;

const TABS: { id: MarketStatus; label: string }[] = [
  { id: 'pending', label: '심사대기' },
  { id: 'approved', label: '판매중' },
  { id: 'rejected', label: '반려' },
  { id: 'hidden', label: '강제숨김' },
  { id: 'sold', label: '판매완료' },
];

export default function AdminMarketPage() {
  const router = useRouter();
  const { ready, user } = useRequireAdmin();
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MarketStatus>('pending');
  const [actingId, setActingId] = useState<string | null>(null);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [savingCategories, setSavingCategories] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setListings(await getListingsForAdmin());
    } catch (error) {
      console.error(error);
      alert('목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await getBoardCategories('market', { includeInactive: true }));
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    if (ready) {
      void load();
      void loadCategories();
    }
  }, [ready, load, loadCategories]);

  useNativePullToRefresh(load);

  const pendingCount = listings.filter((item) => item.status === 'pending').length;
  const filtered = useMemo(
    () => listings.filter((item) => item.status === tab),
    [listings, tab]
  );

  const handleHide = async (id: string) => {
    if (!user) return;
    if (!(await ohgoConfirm('이 판매글을 숨길까요? 공개 목록에서 내려갑니다.'))) return;
    setActingId(id);
    try {
      await hideListing(id, user.uuid);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '숨김 처리에 실패했습니다.');
    } finally {
      setActingId(null);
    }
  };

  const handleUnhide = async (id: string) => {
    if (!user) return;
    if (!(await ohgoConfirm('이 판매글을 다시 게시할까요? 중고장터 목록에 다시 보입니다.'))) return;
    setActingId(id);
    try {
      await unhideListing(id, user.uuid);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '숨김 해제에 실패했습니다.');
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await ohgoConfirm('이 판매글을 삭제할까요? 삭제하면 복구할 수 없습니다.'))) return;
    setActingId(id);
    try {
      await deleteMyListing(id);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '삭제에 실패했습니다.');
    } finally {
      setActingId(null);
    }
  };

  if (!ready) return <OhgoPageLoading />;

  return (
    <SubPageFrame
      title="중고장터 관리"
      onRefresh={() => {
        void load();
        void loadCategories();
      }}
      onBack={() => router.replace('/admin-main')}
    >
      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, marginBottom: 6 }}>
          카테고리 관리
        </div>
        <p style={{ fontSize: 11, color: '#ABABAB', fontFamily: FONT, marginBottom: 12 }}>
          판매글 등록·목록 필터에 쓰입니다. 숨기면 새 글 작성·필터에서만 빠집니다.
        </p>
        <CategoryManager
          scope="market"
          items={categories}
          saving={savingCategories}
          emptyMessage="중고장터 카테고리가 없습니다."
          onSave={async (next) => {
            setSavingCategories(true);
            try {
              setCategories(await saveBoardCategories('market', next));
            } catch (error) {
              alert(error instanceof Error ? error.message : '카테고리 저장에 실패했습니다.');
            } finally {
              setSavingCategories(false);
            }
          }}
        />
      </div>

      <div className="d-flex gap-2 mb-3 overflow-auto">
        {TABS.map((item) => {
          const count = listings.filter((row) => row.status === item.id).length;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="btn flex-shrink-0"
              style={{
                borderRadius: 999,
                border: 'none',
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: FONT,
                backgroundColor: active ? '#1B6FF5' : '#F2F3F5',
                color: active ? '#fff' : '#6F767E',
              }}
            >
              {item.label}
              {item.id === 'pending' && pendingCount > 0 ? ` ${pendingCount}` : count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...OHGO_CARD, padding: 20 }}>
          <EmptyState icon={IoStorefrontOutline} message="해당 상태의 판매글이 없습니다." compact />
        </div>
      ) : (
        <div style={OHGO_CARD}>
          {filtered.map((listing, index) => {
            const createdLabel = formatMarketCreatedAt(listing.createdAt);
            return (
              <div key={listing.id}>
                {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
                <div style={{ padding: '14px 16px' }}>
                  <button
                    type="button"
                    className="btn w-100 p-0 border-0 text-start d-flex gap-3"
                    onClick={() => router.push(`/admin-market/review?id=${listing.id}`)}
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
                          style={{ ...marketStatusStyle(listing.status), fontSize: 10, fontWeight: 700 }}
                        >
                          {MARKET_STATUS_LABELS[listing.status]}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#1B6FF5', fontWeight: 700, fontFamily: FONT }}>
                        {formatMarketPrice(listing.price)}
                      </div>
                      <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 4 }}>
                        {[
                          marketCategoryLabel(listing.category),
                          listing.sellerName,
                          createdLabel,
                        ]
                          .filter(Boolean)
                          .join(' | ')}
                      </div>
                    </div>
                  </button>
                  <div className="d-flex gap-2 mt-2">
                    {listing.status === 'approved' ? (
                      <button
                        type="button"
                        className="btn flex-grow-1"
                        style={{
                          backgroundColor: '#F2F3F5',
                          color: '#6F767E',
                          border: 'none',
                          borderRadius: 10,
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: FONT,
                        }}
                        disabled={actingId === listing.id}
                        onClick={() => void handleHide(listing.id)}
                      >
                        강제 숨김
                      </button>
                    ) : null}
                    {listing.status === 'hidden' ? (
                      <button
                        type="button"
                        className="btn flex-grow-1"
                        style={{
                          backgroundColor: '#F3E8FF',
                          color: '#7B1FA2',
                          border: 'none',
                          borderRadius: 10,
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: FONT,
                        }}
                        disabled={actingId === listing.id}
                        onClick={() => void handleUnhide(listing.id)}
                      >
                        숨김 해제
                      </button>
                    ) : null}
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
                      disabled={actingId === listing.id}
                      onClick={() => void handleDelete(listing.id)}
                    >
                      삭제
                    </button>
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
