'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import MarketListingCard from '@/components/market/MarketListingCard';
import {
  getApprovedListings,
  type MarketCategory,
  type MarketListing,
} from '@/utils/market-service';
import { getBoardCategories, type BoardCategory } from '@/utils/board-category-service';
import CategoryChipRow from '@/components/community/CategoryChipRow';
import { IoAddOutline, IoListOutline, IoStorefrontOutline } from 'react-icons/io5';
import { useNavigation } from '@/hooks/useNavigation';
import { OHGO_FONT } from '@/lib/page-styles';
import { writeHeaderAction } from '@/lib/page-header-action';

const FONT = OHGO_FONT;

export default function MarketPage() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [category, setCategory] = useState<MarketCategory | 'all'>('all');
  const [categories, setCategories] = useState<BoardCategory[]>([]);

  const load = useCallback(async (filter: MarketCategory | 'all') => {
    setLoading(true);
    try {
      const list = await getApprovedListings(filter === 'all' ? undefined : filter);
      setListings(list);
    } catch (error) {
      console.error(error);
      alert('상품을 불러오지 못했습니다.');
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
      setReady(true);
      try {
        setCategories(await getBoardCategories('market'));
      } catch (error) {
        console.error(error);
      }
      await load('all');
    };
    void init();
  }, [router, load]);

  if (!ready) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <SubPageFrame
      title="중고장터"
      onRefresh={() => load(category)}
      headerAction={writeHeaderAction(() => navigate('/market/sell'), '판매 등록')}
    >
      <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
        <p className="mb-0 flex-grow-1 min-w-0" style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
          관리자 승인 후 게시됩니다.
        </p>
        <button
          type="button"
          onClick={() => navigate('/market/my')}
          className="btn d-flex align-items-center gap-1 flex-shrink-0"
          style={{
            backgroundColor: '#F2F3F5',
            border: 'none',
            borderRadius: 10,
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 700,
            color: '#1A1D1F',
            fontFamily: FONT,
            whiteSpace: 'nowrap',
          }}
        >
          <IoListOutline size={14} />
          내 판매글
        </button>
      </div>

      <div className="mb-3">
        <CategoryChipRow
          categories={categories}
          value={category}
          collapsible
          onChange={(value) => {
            setCategory(value);
            void load(value);
          }}
        />
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={IoStorefrontOutline}
          message="등록된 상품이 없습니다."
          style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        />
      ) : (
        <div className="ohgo-market-grid">
          {listings.map((listing) => (
            <MarketListingCard
              key={listing.id}
              listing={listing}
              onClick={() => navigate(`/market/${listing.id}`)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/market/sell')}
        className="btn d-flex align-items-center justify-content-center"
        aria-label="판매 등록"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 88,
          width: 56,
          height: 56,
          borderRadius: 999,
          backgroundColor: '#1B6FF5',
          color: '#fff',
          border: 'none',
          boxShadow: '0 8px 20px rgba(27,111,245,0.35)',
          zIndex: 20,
        }}
      >
        <IoAddOutline size={28} />
      </button>
    </SubPageFrame>
  );
}
