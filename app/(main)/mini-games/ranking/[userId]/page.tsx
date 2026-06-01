'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { IoFishOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { getUser } from '@/lib/storage';
import {
  fetchUserDisplayName,
  fetchUserFishRecords,
  maskName,
  RANKING_FONT,
  type GroupedFishCatch,
} from '@/lib/ranking';

const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
};

export default function RankingUserRecordsPage() {
  const router = useRouter();
  const params = useParams();
  const userId = typeof params.userId === 'string' ? params.userId : '';

  const [viewer, setViewer] = useState<{ uuid?: string; isAdmin?: boolean } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [groupedFish, setGroupedFish] = useState<GroupedFishCatch[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [name, fish] = await Promise.all([
        fetchUserDisplayName(userId),
        fetchUserFishRecords(userId),
      ]);
      setDisplayName(name);
      setGroupedFish(fish);
    } catch (e) {
      console.error(e);
      setGroupedFish([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const init = async () => {
      const u = await getUser();
      if (!u?.uuid) {
        router.replace('/login');
        return;
      }
      setViewer(u);
      if (!userId) {
        router.replace('/mini-games/ranking');
        return;
      }
      await loadRecords();
    };
    init();
  }, [userId, router, loadRecords]);

  if (!viewer || !userId) {
    return (
      <div
        className="min-vh-100 d-flex align-items-center justify-content-center"
        style={{ backgroundColor: '#F7F8FA' }}
      >
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  const isMe = userId === viewer.uuid;
  const isAdmin = viewer.isAdmin || false;
  const titleName = isMe || isAdmin ? displayName : maskName(displayName);

  return (
    <SubPageFrame title={`${titleName}님 기록`} onRefresh={loadRecords}>
      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : groupedFish.length === 0 ? (
        <EmptyState icon={IoFishOutline} message="기록이 없습니다." style={CARD} />
      ) : (
        <div className="d-flex flex-column gap-2">
          {groupedFish.map(f => (
            <div
              key={f.fishName}
              className="d-flex align-items-center gap-3 p-3"
              style={{ ...CARD }}
            >
              {f.img ? (
                <img
                  src={f.img}
                  alt={f.fishName}
                  width={32}
                  height={32}
                  style={{ objectFit: 'contain', borderRadius: 8, flexShrink: 0 }}
                />
              ) : (
                <div
                  className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                  style={{ width: 40, height: 40, backgroundColor: '#F2F3F5' }}
                >
                  <IoFishOutline size={22} color="#6F767E" />
                </div>
              )}
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                <div
                  style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: RANKING_FONT }}
                >
                  {f.fishName}
                </div>
                <div style={{ fontSize: 13, color: '#6F767E', fontFamily: RANKING_FONT }}>
                  {f.count}마리
                </div>
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#1B6FF5',
                  fontFamily: RANKING_FONT,
                  flexShrink: 0,
                }}
              >
                {f.totalPoints.toLocaleString()}P
              </div>
            </div>
          ))}
        </div>
      )}
    </SubPageFrame>
  );
}
