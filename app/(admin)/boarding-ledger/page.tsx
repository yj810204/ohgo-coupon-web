'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { IoCheckmarkCircle, IoChevronForwardOutline, IoDocumentTextOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import LedgerRangeFilter, { rangeForPreset, type LedgerRangePreset } from '@/components/boarding/LedgerRangeFilter';
import { LedgerSourceChips, LedgerStatusChip } from '@/components/boarding/LedgerBadges';
import { useNavigation } from '@/hooks/useNavigation';
import { useStaffActor } from '@/hooks/useStaffActor';
import { isFirebaseDataSource } from '@/lib/data-source';
import { ohgoAlert, ohgoConfirm } from '@/lib/ohgo-dialog';
import { searchMembersByName } from '@/utils/roster-service';
import {
  isCounted,
  type BoardingRange,
  type LedgerEntry,
  type LedgerTripSummary,
} from '@/lib/boarding-ledger.shared';
import { OHGO_CARD, OHGO_FONT, OHGO_INPUT, OhgoPageLoading } from '@/lib/page-styles';

type Ledger = typeof import('@/utils/boarding-ledger.firebase');
const loadLedger = (): Promise<Ledger> => import('@/utils/boarding-ledger.firebase');

const SMALL_BTN: React.CSSProperties = {
  border: '1px solid #E6E8EC',
  background: '#FFFFFF',
  color: '#33383F',
  borderRadius: 10,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: OHGO_FONT,
  whiteSpace: 'nowrap',
};

const MUTED: React.CSSProperties = { fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT };

function tripIssues(t: LedgerTripSummary): number {
  return t.unmatched + t.needsReview + t.onlyInConfirmed.length;
}

function Count({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  if (warn && value === 0) return null;
  return (
    <span style={{ ...MUTED, color: warn ? '#B25E00' : '#6F767E', fontWeight: warn ? 700 : 500 }}>
      {label} {value}
    </span>
  );
}

function TripList({
  trips,
  onlyIssues,
  onOpen,
}: {
  trips: LedgerTripSummary[];
  onlyIssues: boolean;
  onOpen: (t: LedgerTripSummary) => void;
}) {
  const shown = onlyIssues ? trips.filter((t) => !t.reviewed && tripIssues(t) > 0) : trips;
  if (shown.length === 0) {
    return (
      <EmptyState
        icon={IoDocumentTextOutline}
        message={onlyIssues ? '확인할 항차가 없습니다.' : '이 기간에 기록된 항차가 없습니다.'}
        style={OHGO_CARD}
      />
    );
  }
  return (
    <div style={{ ...OHGO_CARD, padding: 0, overflow: 'hidden' }}>
      {shown.map((t, idx) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen(t)}
          className="d-flex align-items-center w-100 text-start"
          style={{
            gap: 12,
            padding: '14px 16px',
            border: 'none',
            borderTop: idx > 0 ? '1px solid #F1F3F5' : 'none',
            background: '#FFFFFF',
            fontFamily: OHGO_FONT,
          }}
        >
          <div className="flex-grow-1 min-w-0">
            <div className="d-flex align-items-center gap-2">
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F' }}>
                {t.date} · {t.tripNumber}항차
              </span>
              {t.reviewed && <IoCheckmarkCircle size={16} color="#2E7D32" aria-label="검토 완료" />}
            </div>
            <div className="d-flex flex-wrap gap-2 mt-1">
              <Count label="승객" value={t.matched + t.unmatched} />
              <Count label="선원" value={t.crew} />
              <Count label="미연결" value={t.unmatched} warn />
              <Count label="확인 필요" value={t.needsReview} warn />
              <Count label="확정명단과 차이" value={t.onlyInConfirmed.length} warn />
              {t.ocrStatus === 'failed' && <span style={{ ...MUTED, color: '#E5484D' }}>명부 판독 실패</span>}
            </div>
          </div>
          <IoChevronForwardOutline size={18} color="#B0B5BB" />
        </button>
      ))}
    </div>
  );
}

function MemberLinker({ onPick, busy }: { onPick: (userId: string, label: string) => void; busy: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ uuid: string; name: string; dob: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const rows = await searchMembersByName(q);
      setResults(rows.map((r) => ({ uuid: r.uuid, name: String(r.name ?? ''), dob: String(r.dob ?? '') })));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="mt-3">
      <div className="d-flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          placeholder="회원 이름"
          style={{ ...OHGO_INPUT, flex: 1, minWidth: 0 }}
        />
        <button type="button" style={SMALL_BTN} disabled={searching} onClick={() => void search()}>
          검색
        </button>
      </div>
      {results.map((r) => (
        <button
          key={r.uuid}
          type="button"
          disabled={busy}
          onClick={() => onPick(r.uuid, `${r.name} ${r.dob}`)}
          className="d-flex justify-content-between w-100 text-start mt-2"
          style={{ ...SMALL_BTN, padding: '8px 10px', fontSize: 13 }}
        >
          <span>{r.name}</span>
          <span style={MUTED}>{r.dob}</span>
        </button>
      ))}
    </div>
  );
}

function TripDetail({
  trip,
  entries,
  who,
  busy,
  onAction,
  onOpenMember,
}: {
  trip: LedgerTripSummary;
  entries: LedgerEntry[];
  who: { userId: string; name: string };
  busy: boolean;
  onAction: (job: (l: Ledger) => Promise<void>, done: string) => Promise<void>;
  onOpenMember: (e: LedgerEntry) => void;
}) {
  const [linking, setLinking] = useState<string | null>(null);
  const counted = entries.filter(isCounted);

  return (
    <>
      <div className="p-3 mb-3" style={OHGO_CARD}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D1F', fontFamily: OHGO_FONT }}>
            {trip.date} · {trip.tripNumber}항차
          </div>
          <span style={MUTED}>
            승객 {counted.filter((e) => e.role !== 'crew').length} · 선원 {counted.filter((e) => e.role === 'crew').length}
          </span>
        </div>
        {trip.rosterImageUrl ? (
          <a href={trip.rosterImageUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={trip.rosterImageUrl}
              alt={`${trip.date} ${trip.tripNumber}항차 명부`}
              style={{ width: '100%', borderRadius: 10, border: '1px solid #E6E8EC' }}
            />
          </a>
        ) : (
          <p style={MUTED}>명부 이미지가 없습니다.</p>
        )}
        {trip.onlyInConfirmed.length > 0 && (
          <p style={{ ...MUTED, color: '#B25E00', margin: '8px 0 0' }}>
            출항 확정 명단에는 있지만 명부 이미지에서 찾지 못한 회원 {trip.onlyInConfirmed.length}명이 있습니다. 명부를
            보고 아래 목록에 없다면 회원 상세에서 승선기록을 추가해 주세요.
          </p>
        )}
      </div>

      <div style={{ ...OHGO_CARD, padding: 0, overflow: 'hidden' }} className="mb-3">
        {entries.map((e, idx) => (
          <div
            key={e.id}
            style={{
              padding: '12px 16px',
              borderTop: idx > 0 ? '1px solid #F1F3F5' : 'none',
              opacity: isCounted(e) ? 1 : 0.6,
              fontFamily: OHGO_FONT,
            }}
          >
            <div className="d-flex justify-content-between align-items-start gap-2">
              <div className="min-w-0">
                <div className="d-flex align-items-center gap-2">
                  {e.userId ? (
                    <button
                      type="button"
                      onClick={() => onOpenMember(e)}
                      style={{ border: 'none', background: 'none', padding: 0, fontSize: 15, fontWeight: 700, color: '#1B6FF5' }}
                    >
                      {e.name || '(이름 없음)'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F' }}>{e.name || '(이름 없음)'}</span>
                  )}
                  <span style={MUTED}>{e.birth}</span>
                </div>
                {(e.evidence.ocrName || e.evidence.ocrBirth) &&
                  (e.evidence.ocrName !== e.name || !e.userId) && (
                    <div style={{ ...MUTED, marginTop: 2 }}>
                      명부 판독: {e.evidence.ocrName || '-'} {e.evidence.ocrBirth || ''}
                    </div>
                  )}
                <div className="d-flex flex-wrap gap-1 mt-1">
                  <LedgerStatusChip entry={e} />
                  <LedgerSourceChips sources={e.sources} />
                </div>
              </div>
              <div className="d-flex flex-column gap-1 align-items-end">
                {e.status === 'void' ? (
                  <button
                    type="button"
                    style={SMALL_BTN}
                    disabled={busy}
                    onClick={() => void onAction((l) => l.restoreBoarding({ id: e.id, actor: who }), '제외를 취소했습니다.')}
                  >
                    제외 취소
                  </button>
                ) : (
                  <>
                    {(e.needsReview || e.status === 'unmatched') && (
                      <button
                        type="button"
                        style={{ ...SMALL_BTN, color: '#1B6FF5', borderColor: '#BFD6FF' }}
                        disabled={busy}
                        onClick={() =>
                          void onAction(
                            (l) => l.confirmBoarding({ id: e.id, actor: who }),
                            e.userId ? '승선으로 확인했습니다.' : '비회원 승선으로 확인했습니다.'
                          )
                        }
                      >
                        {e.userId ? '맞음' : '비회원 확정'}
                      </button>
                    )}
                    <button
                      type="button"
                      style={SMALL_BTN}
                      disabled={busy}
                      onClick={() => setLinking(linking === e.id ? null : e.id)}
                    >
                      {e.userId ? '다른 회원' : '회원 연결'}
                    </button>
                    <button
                      type="button"
                      style={{ ...SMALL_BTN, color: '#E5484D', borderColor: '#F8CFD0' }}
                      disabled={busy}
                      onClick={async () => {
                        if (!(await ohgoConfirm(`${e.name || '이 행'} 승선기록을 제외할까요?`))) return;
                        await onAction((l) => l.voidBoarding({ id: e.id, reason: '원장 검토에서 제외', actor: who }), '제외했습니다.');
                      }}
                    >
                      제외
                    </button>
                  </>
                )}
              </div>
            </div>
            {linking === e.id && (
              <MemberLinker
                busy={busy}
                onPick={async (userId, label) => {
                  if (!(await ohgoConfirm(`${label} 회원으로 연결할까요?`))) return;
                  setLinking(null);
                  await onAction((l) => l.linkBoardingToMember({ id: e.id, userId, actor: who }), '회원으로 연결했습니다.');
                }}
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void onAction(
            (l) => l.setTripReviewed({ date: trip.date, tripNumber: trip.tripNumber, reviewed: !trip.reviewed, actor: who }),
            trip.reviewed ? '검토 완료를 취소했습니다.' : '검토 완료로 표시했습니다.'
          )
        }
        className="w-100"
        style={{
          border: 'none',
          borderRadius: 14,
          padding: '14px 0',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: OHGO_FONT,
          background: trip.reviewed ? '#F1F3F5' : '#1B6FF5',
          color: trip.reviewed ? '#33383F' : '#FFFFFF',
        }}
      >
        {trip.reviewed ? '검토 완료 취소' : '이 항차 검토 완료'}
      </button>
    </>
  );
}

function BoardingLedgerContent() {
  const searchParams = useSearchParams();
  const { navigate } = useNavigation();
  const { ready, actor } = useStaffActor({ requireStaff: true });
  const openDate = searchParams.get('date') || '';
  const openTrip = Number(searchParams.get('trip') || 0);

  const [preset, setPreset] = useState<LedgerRangePreset>('thisMonth');
  const [range, setRange] = useState<BoardingRange | null>(() => rangeForPreset('thisMonth'));
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [trips, setTrips] = useState<LedgerTripSummary[]>([]);
  const [trip, setTrip] = useState<LedgerTripSummary | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isFirebaseDataSource()) {
      setLoaded(true);
      return;
    }
    const ledger = await loadLedger();
    if (openDate && openTrip) {
      const [summary, rows] = await Promise.all([
        ledger.getLedgerTrip(openDate, openTrip),
        ledger.listTripEntries(openDate, openTrip),
      ]);
      setTrip(summary);
      setEntries(rows);
    } else if (range) {
      setTrips(await ledger.listLedgerTrips(range));
    }
    setLoaded(true);
  }, [openDate, openTrip, range]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const onAction = async (job: (l: Ledger) => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await job(await loadLedger());
      await load();
      await ohgoAlert(done);
    } catch (e) {
      await ohgoAlert(e instanceof Error ? e.message : '처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const pending = useMemo(() => trips.filter((t) => !t.reviewed && tripIssues(t) > 0).length, [trips]);

  if (!ready) return <OhgoPageLoading />;

  if (!isFirebaseDataSource()) {
    return (
      <SubPageFrame title="승선기록 원장">
        <EmptyState icon={IoDocumentTextOutline} message="Firebase 운영 환경에서만 사용할 수 있습니다." style={OHGO_CARD} />
      </SubPageFrame>
    );
  }

  if (openDate && openTrip) {
    return (
      <SubPageFrame title="항차 승선기록" onRefresh={load}>
        {loaded && trip ? (
          <TripDetail
            trip={trip}
            entries={entries}
            who={{ userId: actor?.userId ?? '', name: actor?.name ?? '' }}
            busy={busy}
            onAction={onAction}
            onOpenMember={(e) =>
              navigate(`/member-detail?uuid=${e.userId}&name=${encodeURIComponent(e.name)}&dob=${e.birth}`)
            }
          />
        ) : (
          loaded && <EmptyState icon={IoDocumentTextOutline} message="원장에 없는 항차입니다." style={OHGO_CARD} />
        )}
      </SubPageFrame>
    );
  }

  return (
    <SubPageFrame title="승선기록 원장" onRefresh={load}>
      <LedgerRangeFilter
        preset={preset}
        range={range}
        allowAll={false}
        onChange={(p, r) => {
          setPreset(p);
          setRange(r);
        }}
      />
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span style={MUTED}>
          항차 {trips.length} · 확인할 항차 {pending}
        </span>
        <button type="button" style={SMALL_BTN} onClick={() => setOnlyIssues(!onlyIssues)}>
          {onlyIssues ? '전체 보기' : '확인할 항차만'}
        </button>
      </div>
      {loaded && (
        <TripList
          trips={trips}
          onlyIssues={onlyIssues}
          onOpen={(t) => navigate(`/boarding-ledger?date=${t.date}&trip=${t.tripNumber}`)}
        />
      )}
    </SubPageFrame>
  );
}

export default function BoardingLedgerPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <BoardingLedgerContent />
    </Suspense>
  );
}
