'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { IoGameControllerOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { getUser } from '@/lib/storage';
import { getAllGames, type Game } from '@/lib/game-service';
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

function gameThumbUrl(game: Game): string | undefined {
  if (game.thumbnail_url) return game.thumbnail_url;
  if (!game.thumbnail_path) return undefined;
  return game.thumbnail_path.startsWith('http') ? game.thumbnail_path : `/${game.thumbnail_path}`;
}

function matchGame(name: string, games: Game[]): Game | undefined {
  const n = name.trim();
  return games.find(
    (g) =>
      g.game_name === n ||
      g.game_id === n ||
      g.game_id.replace(/_/g, ' ') === n.toLowerCase()
  );
}

export default function RankingUserRecordsPage() {
  const router = useRouter();
  const params = useParams();
  const userId = typeof params.userId === 'string' ? params.userId : '';

  const [viewer, setViewer] = useState<{ uuid?: string; isAdmin?: boolean } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [groupedFish, setGroupedFish] = useState<GroupedFishCatch[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [name, fish, allGames] = await Promise.all([
        fetchUserDisplayName(userId),
        fetchUserFishRecords(userId),
        getAllGames(),
      ]);
      setDisplayName(name);
      setGroupedFish(fish);
      setGames(allGames);
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
        <EmptyState icon={IoGameControllerOutline} message="기록이 없습니다." style={CARD} />
      ) : (
        <div className="d-flex flex-column gap-2">
          {groupedFish.map(f => {
            const game = matchGame(f.fishName, games);
            const thumb = game ? gameThumbUrl(game) : f.img;
            const countLabel = game ? `${f.count}회` : `${f.count}마리`;
            return (
              <div
                key={f.fishName}
                className="d-flex align-items-center gap-3 p-3"
                style={{ ...CARD }}
              >
                {thumb ? (
                  <div
                    className="flex-shrink-0"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      overflow: 'hidden',
                      backgroundColor: '#EBF1FE',
                    }}
                  >
                    <img
                      src={thumb}
                      alt={f.fishName}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                ) : (
                  <div
                    className="d-inline-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#EBF1FE' }}
                  >
                    <IoGameControllerOutline size={22} color="#1B6FF5" />
                  </div>
                )}
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div
                    style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: RANKING_FONT }}
                  >
                    {f.fishName}
                  </div>
                  <div style={{ fontSize: 13, color: '#6F767E', fontFamily: RANKING_FONT }}>
                    {countLabel}
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
            );
          })}
        </div>
      )}
    </SubPageFrame>
  );
}
