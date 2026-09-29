'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { resolveAppUser } from '@/lib/auth-session';
import { isFirebaseDataSource } from '@/lib/data-source';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_LIST_DIVIDER,
  OhgoPageLoading,
} from '@/lib/page-styles';
import {
  RANGE_PRESETS,
  buildBoardingCsv,
  normalizeRange,
  rangePreset,
  type BoardingDateRange,
} from '@/lib/boarding-range';
import { loadBoardingRange, type BoardingRangeResult } from '@/utils/boarding-range.firebase';
import { IoBoatOutline, IoChevronForwardOutline, IoWarningOutline } from 'react-icons/io5';

type Tab = 'members' | 'trips';

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  marginBottom: 4,
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-grow-1 text-center" style={{ minWidth: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1D1F', fontFamily: OHGO_FONT, lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#6F767E', fontFamily: OHGO_FONT, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

function BoardingRecordsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = rangePreset('this-month');
  const [ready, setReady] = useState(false);
  const [startDate, setStartDate] = useState(searchParams.get('start') || initial.startDate);
  const [endDate, setEndDate] = useState(searchParams.get('end') || initial.endDate);
  const [tab, setTab] = useState<Tab>('members');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BoardingRangeResult | null>(null);

  useEffect(() => {
    const check = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      if (!appUser.isAdmin && !appUser.isCaptain) {
        router.replace('/main');
        return;
      }
      setReady(true);
    };
    void check();
  }, [router]);

  const search = useCallback(
    async (range: BoardingDateRange) => {
      const checked = normalizeRange(range.startDate, range.endDate);
      if (!checked.ok) {
        setError(checked.message);
        setResult(null);
        return;
      }
      setLoading(true);
      setError('');
      try {
        router.replace(`/boarding-records?start=${checked.range.startDate}&end=${checked.range.endDate}`);
        setResult(await loadBoardingRange(checked.range));
      } catch (e) {
        console.error('boarding-records:', e);
        setResult(null);
        setError('승선 기록을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    if (!ready) return;
    void search({ startDate, endDate });
    // 첫 진입 때만 자동 조회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return <OhgoPageLoading />;

  if (!isFirebaseDataSource()) {
    return (
      <SubPageFrame title="기간별 승선 기록">
        <EmptyState icon={IoBoatOutline} message="현재 데이터 소스에서는 지원하지 않습니다." style={OHGO_CARD} />
      </SubPageFrame>
    );
  }

  const applyPreset = (id: (typeof RANGE_PRESETS)[number]['id']) => {
    const r = rangePreset(id);
    setStartDate(r.startDate);
    setEndDate(r.endDate);
    void search(r);
  };

  const nameOf = (id: string) => result?.names[id] || '이름 없음';
  const canonicalOf = (id: string) => result?.canonical[id] ?? id;

  return (
    <SubPageFrame title="기간별 승선 기록" onRefresh={() => search({ startDate, endDate })}>
      <div className="mb-3" style={{ ...OHGO_CARD, padding: 14 }}>
        <div className="d-flex gap-2">
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <div style={LABEL}>시작일</div>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ ...OHGO_INPUT, width: '100%' }}
            />
          </div>
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <div style={LABEL}>종료일</div>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ ...OHGO_INPUT, width: '100%' }}
            />
          </div>
        </div>
        <div className="d-flex gap-2 mt-2">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn btn-sm flex-grow-1"
              onClick={() => applyPreset(p.id)}
              disabled={loading}
              style={{
                borderRadius: 999,
                border: '1px solid #EFEFEF',
                backgroundColor: '#FFFFFF',
                color: '#1A1D1F',
                fontFamily: OHGO_FONT,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`btn w-100 mt-3 ${OHGO_CONFIRM_BTN_CLASS}`}
          style={{ ...OHGO_CONFIRM_BTN, padding: '10px 16px', opacity: loading ? 0.65 : 1 }}
          disabled={loading}
          onClick={() => void search({ startDate, endDate })}
        >
          {loading ? '조회 중…' : '조회'}
        </button>
        <div style={{ fontSize: 11, color: '#ABABAB', fontFamily: OHGO_FONT, marginTop: 8 }}>
          한국 시간 기준, 시작일·종료일 포함
        </div>
      </div>

      {error ? (
        <EmptyState icon={IoWarningOutline} message={error} style={OHGO_CARD} />
      ) : loading && !result ? (
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
        </div>
      ) : result ? (
        <>
          <div className="mb-3 d-flex" style={{ ...OHGO_CARD, padding: '14px 8px' }}>
            <Stat label="출항" value={`${result.totals.trips}회`} />
            <Stat label="승선 연인원" value={`${result.totals.boardings}명`} />
            <Stat label="회원" value={`${result.totals.members}명`} />
            <Stat label="스탬프" value={`${result.totals.stamps}개`} />
          </div>

          {result.totals.tripsWithoutList > 0 && (
            <p style={{ fontSize: 12, color: '#E65100', fontFamily: OHGO_FONT, margin: '0 2px 12px' }}>
              명단이 저장되지 않은 확정 항차 {result.totals.tripsWithoutList}회는 인원에 포함되지 않습니다.
            </p>
          )}

          <div className="d-flex gap-2 mb-3">
            {(
              [
                ['members', '회원별'],
                ['trips', '항차별'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="btn btn-sm flex-grow-1"
                onClick={() => setTab(id)}
                style={{
                  borderRadius: 999,
                  border: 'none',
                  backgroundColor: tab === id ? '#1B6FF5' : '#EDF5FF',
                  color: tab === id ? '#FFFFFF' : '#237FFF',
                  fontFamily: OHGO_FONT,
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '8px 0',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'members' ? (
            result.members.length === 0 ? (
              <EmptyState icon={IoBoatOutline} message="기간 내 승선 기록이 없습니다." style={OHGO_CARD} />
            ) : (
              <div className="mb-3" style={{ ...OHGO_CARD, overflow: 'hidden' }}>
                {result.members.map((m, i) => (
                  <div key={m.id}>
                    {i > 0 && <div style={OHGO_LIST_DIVIDER} />}
                    <button
                      type="button"
                      className="btn w-100 text-start border-0 rounded-0 d-flex align-items-center gap-2"
                      style={{ padding: '12px 16px', fontFamily: OHGO_FONT }}
                      onClick={() =>
                        router.push(
                          `/boarding-history?uuid=${m.id}&name=${encodeURIComponent(m.name)}&start=${result.range.startDate}&end=${result.range.endDate}`
                        )
                      }
                    >
                      <div className="flex-grow-1 min-w-0">
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F' }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: '#6F767E', marginTop: 2 }}>
                          승선 {m.boardings}회 · 스탬프 {m.stamps}개 · 승선일수 반영 {m.tripCredited}회
                        </div>
                      </div>
                      <IoChevronForwardOutline size={18} color="#ABABAB" className="flex-shrink-0" />
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : result.trips.length === 0 ? (
            <EmptyState icon={IoBoatOutline} message="기간 내 확정된 출항이 없습니다." style={OHGO_CARD} />
          ) : (
            <div className="mb-3" style={{ ...OHGO_CARD, overflow: 'hidden' }}>
              {result.trips.map((t, i) => {
                const names = [...new Set(t.memberIds.map(canonicalOf))].map(nameOf);
                return (
                  <div key={`${t.date}-${t.tripNumber}`}>
                    {i > 0 && <div style={OHGO_LIST_DIVIDER} />}
                    <div style={{ padding: '12px 16px', fontFamily: OHGO_FONT }}>
                      <div className="d-flex align-items-center gap-2">
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F' }}>{t.date}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#1B6FF5',
                            backgroundColor: '#EBF1FE',
                            borderRadius: 999,
                            padding: '2px 8px',
                          }}
                        >
                          {t.tripNumber}항차
                        </span>
                        <span style={{ fontSize: 12, color: '#6F767E', marginLeft: 'auto' }}>
                          {t.hasMemberList ? `${names.length}명` : '명단 없음'}
                        </span>
                      </div>
                      {names.length > 0 && (
                        <div style={{ fontSize: 13, color: '#6F767E', marginTop: 6, lineHeight: 1.5 }}>
                          {names.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(result.members.length > 0 || result.trips.length > 0) && (
            <button
              type="button"
              className={`btn w-100 ${OHGO_DISMISS_BTN_CLASS}`}
              style={OHGO_DISMISS_BTN}
              onClick={() =>
                downloadCsv(
                  `승선기록_${result.range.startDate}_${result.range.endDate}.csv`,
                  buildBoardingCsv({
                    range: result.range,
                    trips: result.trips,
                    members: result.members,
                    nameOf,
                    canonicalOf,
                  })
                )
              }
            >
              CSV 내려받기
            </button>
          )}
        </>
      ) : null}
    </SubPageFrame>
  );
}

export default function BoardingRecordsPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <BoardingRecordsContent />
    </Suspense>
  );
}
