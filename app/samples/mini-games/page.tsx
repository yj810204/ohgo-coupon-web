'use client';

import { useRouter } from '@/hooks/useAppRouter';
import SubPageFrame from '@/components/SubPageFrame';
import { IoGameControllerOutline, IoNotificationsOutline, IoTrophyOutline } from 'react-icons/io5';
import { SAMPLE_GAME_NOTICE, SAMPLE_GAMES } from '@/lib/samples/mock-data';

const FONT = "var(--font-ohgo), sans-serif";
const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
};

export default function SampleMiniGamesPage() {
  const router = useRouter();
  const noticeLine = SAMPLE_GAME_NOTICE.split('\n')[0];

  return (
    <SubPageFrame
      title="미니 게임"
      showMyPage={false}
      onBack={() => router.push('/samples/main')}
    >
      <div
        className="d-flex align-items-center gap-3 mb-4 p-3"
        style={{ backgroundColor: '#EBF1FE', borderRadius: 14 }}
      >
        <IoNotificationsOutline size={20} color="#1B6FF5" className="flex-shrink-0" />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#1B6FF5',
            fontFamily: FONT,
            flexGrow: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {noticeLine}
        </span>
        <span style={{ fontSize: 12, color: '#1B6FF5', flexShrink: 0 }}>자세히 →</span>
      </div>

      <button
        type="button"
        className="btn w-100 d-flex align-items-center justify-content-center gap-2 mb-4"
        style={{
          backgroundColor: '#1B6FF5',
          color: '#fff',
          borderRadius: 14,
          padding: '14px',
          border: 'none',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 15,
          boxShadow: '0 4px 12px rgba(27,111,245,0.3)',
        }}
      >
        <IoTrophyOutline size={22} />
        랭킹 보기
      </button>

      <div className="d-flex flex-column gap-3">
        {SAMPLE_GAMES.map((game) => (
          <button
            key={game.game_id}
            type="button"
            onClick={() => router.push(game.playPath)}
            className="btn w-100 text-start p-0"
            style={{ ...CARD, overflow: 'hidden' }}
          >
            {game.thumbnail_url ? (
              <img
                src={game.thumbnail_url}
                alt={game.game_name}
                style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div
                className="d-flex align-items-center justify-content-center"
                style={{ height: 120, backgroundColor: '#F7F8FA' }}
              >
                <div
                  className="d-inline-flex align-items-center justify-content-center rounded-circle"
                  style={{ width: 56, height: 56, backgroundColor: '#EBF1FE' }}
                >
                  <IoGameControllerOutline size={28} color="#1B6FF5" />
                </div>
              </div>
            )}
            <div className="p-3">
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                {game.game_name}
              </div>
              {game.game_description && (
                <div
                  style={{
                    fontSize: 13,
                    color: '#6F767E',
                    fontFamily: FONT,
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  {game.game_description}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </SubPageFrame>
  );
}
