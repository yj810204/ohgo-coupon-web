'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveAppUser } from '@/lib/auth-session';
import { getAllGames, toggleGameActive, Game, getGlobalGameSettings, updateGlobalGameSettings, getTournamentSettings, updateTournamentSettings, getGameBaitConfig, updateGameBaitConfig } from '@/lib/game-service';
import { ADMIN_EDIT_ICON } from '@/lib/admin-icons';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import {
  IoGameControllerOutline,
  IoImageOutline,
  IoPlayOutline,
  IoPauseOutline,
  IoRefreshOutline,
} from 'react-icons/io5';
import {
  OHGO_CARD,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_PRIMARY_BTN,
  OHGO_SECONDARY_BTN,
  OhgoPageLoading,
} from '@/lib/page-styles';

function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16);
}

function formatGameRegdate(regdate: Game['regdate']): string {
  if (!regdate) return '-';
  if (typeof regdate === 'string') {
    const d = new Date(regdate);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('ko-KR');
  }
  if (typeof regdate === 'object' && regdate !== null && 'seconds' in regdate) {
    const seconds = Number((regdate as { seconds: number }).seconds);
    if (!Number.isNaN(seconds)) {
      return new Date(seconds * 1000).toLocaleDateString('ko-KR');
    }
  }
  return '-';
}

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#6F767E',
  fontFamily: FONT,
  marginBottom: 6,
  display: 'block',
};

const HINT: React.CSSProperties = {
  fontSize: 11,
  color: '#ABABAB',
  fontFamily: FONT,
  marginTop: 6,
  marginBottom: 0,
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#1A1D1F',
  fontFamily: FONT,
  marginBottom: 12,
};

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...CARD, padding: '14px 16px', marginBottom: 12 }}>
      <div style={SECTION_TITLE}>{title}</div>
      {children}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div style={{ backgroundColor: '#F7F8FA', borderRadius: 12, padding: '12px 14px' }}>
      <div className="form-check form-switch mb-0">
        <input
          className="form-check-input"
          type="checkbox"
          id={id}
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        <label className="form-check-label" htmlFor={id} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14 }}>
          {label}
        </label>
      </div>
      {hint ? <p style={{ ...HINT, marginTop: 8 }}>{hint}</p> : null}
    </div>
  );
}

function InlineNumberSave({
  label,
  hint,
  value,
  onChange,
  onSave,
  saving,
  min,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  min?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <input
          type="number"
          className="form-control"
          style={{ ...OHGO_INPUT, margin: 0 }}
          min={min}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="btn fw-semibold flex-shrink-0"
          style={{
            ...OHGO_PRIMARY_BTN,
            padding: '10px 14px',
            fontSize: 13,
            boxShadow: 'none',
            minWidth: 72,
            opacity: saving ? 0.65 : 1,
          }}
          onClick={onSave}
          disabled={saving}
        >
          {saving ? '저장 중' : '저장'}
        </button>
      </div>
      {hint ? <p style={HINT}>{hint}</p> : null}
    </div>
  );
}

function gameThumbUrl(game: Game): string | undefined {
  if (game.thumbnail_url) return game.thumbnail_url;
  if (game.thumbnail_path) {
    if (game.thumbnail_path.startsWith('http://') || game.thumbnail_path.startsWith('https://')) {
      return game.thumbnail_path;
    }
    return `/${game.thumbnail_path.replace(/^\//, '')}`;
  }
  return undefined;
}

function MedalCountPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: 1 | 2 | 3) => void;
}) {
  const options: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: '1위만' },
    { n: 2, label: '2위까지' },
    { n: 3, label: '3위까지' },
  ];
  return (
    <div className="d-flex gap-2">
      {options.map(opt => {
        const active = value === opt.n;
        return (
          <button
            key={opt.n}
            type="button"
            className="btn flex-fill"
            style={{
              backgroundColor: active ? '#1B6FF5' : '#F7F8FA',
              color: active ? '#fff' : '#6F767E',
              border: active ? 'none' : '1.5px solid #EFEFEF',
              borderRadius: 10,
              padding: '10px 8px',
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
            }}
            onClick={() => onChange(opt.n)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminGameSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<Game[]>([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // 통합 설정 상태
  const [globalSettings, setGlobalSettings] = useState({
    tournament_enabled: false,
    tournament_title: '',
    tournament_description: '',
    tournament_start_date: '',
    tournament_end_date: '',
    show_medals: true,
    ranking_medal_count: 3, // 1, 2, 3 중 선택 (기본값 3)
  });

  // 게임 티켓 수량 관리 상태
  const [ticketSettings, setTicketSettings] = useState({
    daily_limit: '',
    ticket_per_coupon: '5',
  });
  const [savingTicketLimit, setSavingTicketLimit] = useState(false);
  const [savingTicketPerCoupon, setSavingTicketPerCoupon] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }

      if (!appUser.isAdmin) {
        router.replace('/main');
        return;
      }

      setLoading(false);
      await Promise.all([loadGames(), loadSettings()]);
    };
    checkAuth();
  }, [router]);

  const loadGames = async () => {
    try {
      const allGames = await getAllGames();
      setGames(allGames);
    } catch (error) {
      console.error('Error loading games:', error);
      alert('게임 목록을 불러오는 중 오류가 발생했습니다.');
    }
  };

  const loadSettings = async () => {
    try {
      const [global, tournament, bait] = await Promise.all([
        getGlobalGameSettings(),
        getTournamentSettings(),
        getGameBaitConfig(),
      ]);

      const hasTournamentDates = Boolean(tournament?.title && tournament?.startDate && tournament?.endDate);

      setGlobalSettings({
        tournament_enabled: global?.tournament_enabled ?? hasTournamentDates,
        tournament_title: tournament?.title ?? '',
        tournament_description: tournament?.description ?? '',
        tournament_start_date: toDatetimeLocalValue(tournament?.startDate),
        tournament_end_date: toDatetimeLocalValue(tournament?.endDate),
        show_medals: global?.show_medals !== undefined ? global.show_medals : true,
        ranking_medal_count: (global?.ranking_medal_count ?? 3) as 1 | 2 | 3,
      });

      setTicketSettings({
        daily_limit: bait?.dailyLimit != null ? String(bait.dailyLimit) : '',
        ticket_per_coupon: bait?.baitPerCoupon != null ? String(bait.baitPerCoupon) : '5',
      });
    } catch (error) {
      console.error('Error loading game settings:', error);
    }
  };

  const handleSaveGlobalSettings = async () => {
    try {
      setSaving(true);

      await updateGlobalGameSettings({
        tournament_enabled: globalSettings.tournament_enabled,
        show_medals: globalSettings.show_medals,
        ranking_medal_count: globalSettings.ranking_medal_count,
      });

      if (
        globalSettings.tournament_enabled &&
        globalSettings.tournament_title &&
        globalSettings.tournament_start_date &&
        globalSettings.tournament_end_date
      ) {
        await updateTournamentSettings({
          title: globalSettings.tournament_title,
          description: globalSettings.tournament_description || '',
          startDate: new Date(globalSettings.tournament_start_date).toISOString(),
          endDate: new Date(globalSettings.tournament_end_date).toISOString(),
        });
      }

      alert('통합 설정이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving global settings:', error);
      alert('통합 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTicketLimit = async () => {
    if (!ticketSettings.daily_limit.trim()) {
      alert('일일 게임 티켓 수량을 입력해주세요.');
      return;
    }

    const ticketLimitNumber = parseInt(ticketSettings.daily_limit);
    if (isNaN(ticketLimitNumber) || ticketLimitNumber < 0) {
      alert('유효한 숫자를 입력해주세요.');
      return;
    }

    try {
      setSavingTicketLimit(true);
      await updateGameBaitConfig({ dailyLimit: ticketLimitNumber });
      alert('일일 게임 티켓 수량이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving daily ticket limit:', error);
      alert('일일 게임 티켓 수량 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingTicketLimit(false);
    }
  };

  const handleSaveTicketPerCoupon = async () => {
    if (!ticketSettings.ticket_per_coupon.trim()) {
      alert('교환권 당 게임 티켓 수량을 입력해주세요.');
      return;
    }

    const ticketPerCouponNumber = parseInt(ticketSettings.ticket_per_coupon);
    if (isNaN(ticketPerCouponNumber) || ticketPerCouponNumber <= 0) {
      alert('교환권 당 게임 티켓 수량은 1 이상의 숫자여야 합니다.');
      return;
    }

    try {
      setSavingTicketPerCoupon(true);
      await updateGameBaitConfig({ baitPerCoupon: ticketPerCouponNumber });
      alert('교환권 당 게임 티켓 수량이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving ticket per coupon:', error);
      alert('교환권 당 게임 티켓 수량 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingTicketPerCoupon(false);
    }
  };

  const handleScanGames = async () => {
    if (!confirm('games 폴더를 스캔하여 게임을 등록하시겠습니까?')) {
      return;
    }

    setScanning(true);
    try {
      const response = await fetch('/api/games/scan', {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        const message = `게임 스캔 완료: ${result.registered}개 등록, ${result.updated}개 업데이트`;
        if (result.errors && result.errors.length > 0) {
          console.warn('스캔 중 오류:', result.errors);
          alert(`${message}\n\n오류:\n${result.errors.join('\n')}`);
        } else {
          alert(message);
        }
        await loadGames();
      } else {
        alert(`게임 스캔 실패: ${result.message}\n\n오류:\n${(result.errors || []).join('\n')}`);
      }
    } catch (error) {
      console.error('Scan error:', error);
      alert('게임 스캔 중 오류가 발생했습니다.');
    } finally {
      setScanning(false);
    }
  };

  const handleToggleGame = async (gameId: string, currentStatus: boolean) => {
    if (!confirm(`게임을 ${currentStatus ? '비활성화' : '활성화'}하시겠습니까?`)) {
      return;
    }

    try {
      await toggleGameActive(gameId, !currentStatus);
      await loadGames();
    } catch (error) {
      console.error('Toggle error:', error);
      alert('게임 상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleEditGame = (game: Game) => {
    router.push(`/admin-game-settings/${game.game_id}`);
  };

  if (loading) {
    return <OhgoPageLoading />;
  }

  const formatGameDate = (game: Game) => formatGameRegdate(game.regdate);

  return (
    <SubPageFrame title="게임 설정">
      <FormSection title="대회 설정">
        <SwitchRow
          id="tournament_enabled"
          label="대회 모드 활성화"
          hint="활성화 시 지정 기간 동안 대회 랭킹이 표시됩니다."
          checked={globalSettings.tournament_enabled}
          onChange={checked => setGlobalSettings({ ...globalSettings, tournament_enabled: checked })}
        />
        {globalSettings.tournament_enabled && (
          <div className="mt-3 d-flex flex-column gap-3">
            <div>
              <label style={LABEL}>대회 타이틀</label>
              <input
                type="text"
                className="form-control"
                style={OHGO_INPUT}
                value={globalSettings.tournament_title}
                onChange={e => setGlobalSettings({ ...globalSettings, tournament_title: e.target.value })}
                placeholder="대회 타이틀"
              />
            </div>
            <div>
              <label style={LABEL}>대회 간단설명</label>
              <textarea
                className="form-control"
                rows={3}
                style={{ ...OHGO_INPUT, resize: 'none' }}
                value={globalSettings.tournament_description}
                onChange={e =>
                  setGlobalSettings({ ...globalSettings, tournament_description: e.target.value })
                }
                placeholder="대회 설명"
              />
            </div>
            <div className="row g-2">
              <div className="col-6">
                <label style={LABEL}>시작일</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  style={{ ...OHGO_INPUT, fontSize: 13 }}
                  value={globalSettings.tournament_start_date}
                  onChange={e =>
                    setGlobalSettings({ ...globalSettings, tournament_start_date: e.target.value })
                  }
                />
              </div>
              <div className="col-6">
                <label style={LABEL}>종료일</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  style={{ ...OHGO_INPUT, fontSize: 13 }}
                  value={globalSettings.tournament_end_date}
                  onChange={e =>
                    setGlobalSettings({ ...globalSettings, tournament_end_date: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        )}
      </FormSection>

      <FormSection title="일일 게임 티켓">
        <div className="d-flex flex-column gap-3">
        <InlineNumberSave
          label="일일 게임 티켓 수량 제한"
          value={ticketSettings.daily_limit}
          onChange={v => setTicketSettings({ ...ticketSettings, daily_limit: v })}
          onSave={() => void handleSaveTicketLimit()}
          saving={savingTicketLimit}
          min={0}
          placeholder="예: 10"
        />
        <InlineNumberSave
          label="교환권 당 게임 티켓 수량"
          hint="게임 티켓 교환권 1개 사용 시 지급되는 티켓 수입니다."
          value={ticketSettings.ticket_per_coupon}
          onChange={v => setTicketSettings({ ...ticketSettings, ticket_per_coupon: v })}
          onSave={() => void handleSaveTicketPerCoupon()}
          saving={savingTicketPerCoupon}
          min={1}
          placeholder="예: 5"
        />
        </div>
      </FormSection>

      <FormSection title="랭킹 표시">
        <SwitchRow
          id="show_medals"
          label="순위 메달 표시"
          hint="랭킹 화면에서 메달 아이콘을 표시합니다."
          checked={globalSettings.show_medals}
          onChange={checked => setGlobalSettings({ ...globalSettings, show_medals: checked })}
        />
        {globalSettings.show_medals && (
          <div className="mt-3">
            <label style={LABEL}>순위 메달 표시 개수</label>
            <MedalCountPicker
              value={globalSettings.ranking_medal_count}
              onChange={n => setGlobalSettings({ ...globalSettings, ranking_medal_count: n })}
            />
            <p style={HINT}>랭킹에 표시할 메달 범위입니다. (1~3위)</p>
          </div>
        )}
      </FormSection>

      <button
        type="button"
        className={`btn w-100 fw-semibold mb-3 ${OHGO_CONFIRM_BTN_CLASS}`}
        style={{ ...OHGO_PRIMARY_BTN, opacity: saving ? 0.65 : 1 }}
        onClick={() => void handleSaveGlobalSettings()}
        disabled={saving}
      >
        {saving ? '저장 중...' : '대회·랭킹 설정 저장'}
      </button>

      <FormSection title="게임 폴더 스캔">
        <button
          type="button"
          className="btn w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold"
          style={OHGO_SECONDARY_BTN}
          onClick={() => void handleScanGames()}
          disabled={scanning}
        >
          <IoRefreshOutline size={18} />
          {scanning ? '스캔 중...' : '게임 스캔'}
        </button>
        <p style={{ ...HINT, marginTop: 10 }}>
          public/games/ 폴더의 게임을 자동으로 스캔하여 등록합니다.
        </p>
      </FormSection>

      <FormSection title={games.length > 0 ? `게임 목록 · ${games.length}개` : '게임 목록'}>
        {games.length === 0 ? (
          <EmptyState
            icon={IoGameControllerOutline}
            message="등록된 게임이 없습니다."
            subtitle="public/games/ 폴더에 추가 후 스캔해 주세요."
            compact
          />
        ) : (
          <div
            style={{
              borderRadius: 14,
              border: '1px solid #EFEFEF',
              overflow: 'hidden',
              backgroundColor: '#FFFFFF',
            }}
          >
            {games.map((game, index) => {
              const thumb = gameThumbUrl(game);
              return (
                <div
                  key={game.game_id}
                  className="px-3 py-3"
                  style={{
                    borderBottom: index < games.length - 1 ? '1px solid #F7F8FA' : 'none',
                    backgroundColor: game.is_active ? '#FFFFFF' : '#FAFAFA',
                  }}
                >
                  <div className="d-flex align-items-center gap-3">
                    <div
                      className="flex-shrink-0 overflow-hidden d-flex align-items-center justify-content-center"
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 12,
                        background: thumb ? `url(${thumb}) center/cover` : '#F2F3F5',
                        border: '1px solid #EFEFEF',
                      }}
                    >
                      {!thumb && <IoImageOutline size={24} color="#B0B8C4" />}
                    </div>

                    <div className="flex-grow-1 min-w-0">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span
                          className="badge rounded-pill flex-shrink-0"
                          style={{
                            backgroundColor: '#F7F8FA',
                            color: '#6F767E',
                            fontSize: 10,
                            fontFamily: FONT,
                            fontWeight: 700,
                          }}
                        >
                          {index + 1}
                        </span>
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: '#1A1D1F',
                            fontFamily: FONT,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {game.game_name}
                        </span>
                        <span
                          className="badge rounded-pill flex-shrink-0"
                          style={{
                            backgroundColor: game.is_active ? '#EBF1FE' : '#F7F8FA',
                            color: game.is_active ? '#1B6FF5' : '#6F767E',
                            fontSize: 10,
                            fontFamily: FONT,
                            fontWeight: 600,
                          }}
                        >
                          {game.is_active ? '활성' : '비활성'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 6 }}>
                        {game.game_id}
                        {game.game_type ? ` · ${game.game_type}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: '#ABABAB', fontFamily: FONT, marginTop: 4 }}>
                        포인트 {game.point_rate ?? 100}% · {formatGameDate(game)}
                      </div>
                    </div>

                    <div className="d-flex flex-row gap-1 flex-shrink-0 align-self-center">
                      <button
                        type="button"
                        onClick={() => void handleToggleGame(game.game_id, game.is_active)}
                        className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                        title={game.is_active ? '비활성화' : '활성화'}
                        style={{
                          width: 32,
                          height: 32,
                          backgroundColor: game.is_active ? '#FFF0F0' : '#EBF1FE',
                          border: 'none',
                        }}
                      >
                        {game.is_active ? (
                          <IoPauseOutline size={16} color="#FF3B30" />
                        ) : (
                          <IoPlayOutline size={16} color="#1B6FF5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditGame(game)}
                        className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                        title="수정"
                        style={{ width: 32, height: 32, backgroundColor: '#EBF1FE', border: 'none' }}
                      >
                        <ADMIN_EDIT_ICON size={16} color="#1B6FF5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FormSection>
    </SubPageFrame>
  );
}
