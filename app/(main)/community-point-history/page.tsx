'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { IoChatbubblesOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import PointHistoryList, { POINT_HISTORY_SUMMARY_CARD } from '@/components/PointHistoryList';
import { getUser } from '@/lib/storage';
import { OHGO_FONT, OhgoPageLoading } from '@/lib/page-styles';
import { getUserPointBalance } from '@/utils/point-mall-service';
import { getCommunityPointHistory, type PointHistoryItem } from '@/utils/point-history-service';

const FONT = OHGO_FONT;

export default function CommunityPointHistoryPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [items, setItems] = useState<PointHistoryItem[]>([]);

  const load = useCallback(async (uuid: string) => {
    setLoading(true);
    try {
      const [b, history] = await Promise.all([
        getUserPointBalance(uuid),
        getCommunityPointHistory(uuid),
      ]);
      setBalance(b.communityPoints);
      setItems(history);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      await load(user.uuid);
      setReady(true);
    };
    void init();
  }, [router, load]);

  if (!ready) return <OhgoPageLoading />;

  return (
    <SubPageFrame
      title="커뮤니티 포인트 내역"
      onRefresh={async () => {
        const user = await getUser();
        if (user?.uuid) await load(user.uuid);
      }}
    >
      <div className="mb-3" style={POINT_HISTORY_SUMMARY_CARD}>
        <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>보유 커뮤니티 포인트</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT, marginTop: 4 }}>
          {balance.toLocaleString('ko-KR')}P
        </div>
      </div>
      <PointHistoryList
        items={items}
        loading={loading}
        emptyIcon={IoChatbubblesOutline}
        emptyMessage="커뮤니티 포인트 내역이 없습니다."
      />
    </SubPageFrame>
  );
}
