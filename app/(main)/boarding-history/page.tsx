'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { listMemberBoardingDates } from '@/utils/roster-service';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import LedgerRangeFilter, { rangeForPreset, type LedgerRangePreset } from '@/components/boarding/LedgerRangeFilter';
import { LedgerSourceChips, LedgerStatusChip } from '@/components/boarding/LedgerBadges';
import { useStaffActor } from '@/hooks/useStaffActor';
import { isFirebaseDataSource } from '@/lib/data-source';
import { getTodayDate } from '@/lib/kst-date';
import { ohgoAlert, ohgoConfirm } from '@/lib/ohgo-dialog';
import {
  countMemberBoardings,
  isCounted,
  isDateInRange,
  isValidDate,
  type BoardingRange,
  type LedgerEntry,
} from '@/lib/boarding-ledger.shared';
import { IoBoatOutline } from 'react-icons/io5';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OhgoPageLoading,
} from '@/lib/page-styles';

const REASONS = ['명부 누락', '현장 확인', '출항 확정 누락', '기타'] as const;
const VOID_REASONS = ['잘못 기록됨', '다른 사람 기록', '중복 기록', '기타'] as const;

const SMALL_BTN: React.CSSProperties = {
  border: '1px solid #E6E8EC',
  background: '#FFFFFF',
  color: '#33383F',
  borderRadius: 10,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: OHGO_FONT,
};

type Ledger = typeof import('@/utils/boarding-ledger.firebase');

function loadLedger(): Promise<Ledger> {
  return import('@/utils/boarding-ledger.firebase');
}

function BoardingHistoryPageContent() {
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid') || '';
  const name = searchParams.get('name') || '';
  const wantManage = searchParams.get('manage') === '1';
  const { actor } = useStaffActor();
  const canManage = Boolean(wantManage && actor?.isStaff && isFirebaseDataSource());

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [legacy, setLegacy] = useState<{ date: string; tripNumber: number }[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [preset, setPreset] = useState<LedgerRangePreset>('all');
  const [range, setRange] = useState<BoardingRange | null>(null);
  const [busy, setBusy] = useState(false);

  const [addDate, setAddDate] = useState(getTodayDate());
  const [addTrip, setAddTrip] = useState(1);
  const [addReason, setAddReason] = useState<string>(REASONS[0]);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState<string>(VOID_REASONS[0]);

  const load = useCallback(async () => {
    if (!uuid) return;
    if (!isFirebaseDataSource()) {
      setLegacy(await listMemberBoardingDates(uuid));
      setLoaded(true);
      return;
    }
    const ledger = await loadLedger();
    const rows = await ledger.listMemberBoardings(uuid);
    setEntries(rows);
    setLegacy(rows.length === 0 ? await listMemberBoardingDates(uuid) : null);
    setLoaded(true);
  }, [uuid]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => entries.filter((e) => isDateInRange(e.date, range) && (canManage || isCounted(e))),
    [entries, range, canManage]
  );
  const countedInRange = useMemo(
    () => countMemberBoardings(entries.filter((e) => isDateInRange(e.date, range)), entries[0]?.userId ?? uuid),
    [entries, range, uuid]
  );

  const actorArg = () => ({ userId: actor?.userId ?? '', name: actor?.name ?? '' });

  const run = async (job: (ledger: Ledger) => Promise<void>, done: string) => {
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

  const handleAdd = async () => {
    if (!isValidDate(addDate)) {
      await ohgoAlert('승선일을 선택해 주세요.');
      return;
    }
    const ok = await ohgoConfirm(`${addDate} ${addTrip}항차 승선기록을 추가할까요?\n사유: ${addReason}`);
    if (!ok) return;
    await run(
      (l) => l.addManualBoarding({ userId: uuid, date: addDate, tripNumber: addTrip, reason: addReason, actor: actorArg() }).then(() => undefined),
      '승선기록을 추가했습니다.'
    );
  };

  const handleVoid = async (entry: LedgerEntry) => {
    setVoidTarget(null);
    await run(
      (l) => l.voidBoarding({ id: entry.id, reason: voidReason, actor: actorArg() }),
      `${entry.date} ${entry.tripNumber}항차 기록을 제외했습니다.`
    );
  };

  const title = name ? `${name} 승선 기록` : '승선 기록';

  return (
    <SubPageFrame title={title} onRefresh={load}>
      {isFirebaseDataSource() && (
        <LedgerRangeFilter
          preset={preset}
          range={range}
          onChange={(p, r) => {
            setPreset(p);
            setRange(p === 'all' ? null : r ?? rangeForPreset(p));
          }}
        />
      )}

      {canManage && (
        <div className="p-3 mb-3" style={OHGO_CARD}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT, marginBottom: 10 }}>
            승선기록 추가
          </div>
          <div className="d-flex gap-2 mb-2">
            <input
              type="date"
              value={addDate}
              max={getTodayDate()}
              onChange={(e) => setAddDate(e.target.value)}
              style={{ ...OHGO_INPUT, flex: 1, minWidth: 0 }}
              aria-label="승선일"
            />
            <select
              value={addTrip}
              onChange={(e) => setAddTrip(Number(e.target.value))}
              style={{ ...OHGO_INPUT, width: 96 }}
              aria-label="항차"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}항차
                </option>
              ))}
            </select>
          </div>
          <select
            value={addReason}
            onChange={(e) => setAddReason(e.target.value)}
            style={{ ...OHGO_INPUT, width: '100%', marginBottom: 10 }}
            aria-label="추가 사유"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={OHGO_CONFIRM_BTN_CLASS}
            style={{ ...OHGO_CONFIRM_BTN, width: '100%' }}
            disabled={busy}
            onClick={() => void handleAdd()}
          >
            추가
          </button>
          <p style={{ fontSize: 12, color: '#6F767E', margin: '8px 0 0', fontFamily: OHGO_FONT }}>
            추가·제외하면 승선 횟수에 반영되고 회원 로그에 남습니다.
          </p>
        </div>
      )}

      {loaded && legacy == null && (
        <p style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT, margin: '0 0 12px' }}>
          {range ? '선택 기간 ' : ''}
          {countedInRange}회
        </p>
      )}

      <div className="d-flex flex-column gap-3">
        {visible.map((item) => {
          const counted = isCounted(item);
          return (
            <div key={item.id} className="p-3" style={{ ...OHGO_CARD, opacity: counted ? 1 : 0.6 }}>
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT }}>
                    {item.date} · {item.tripNumber}항차
                  </div>
                  <div className="d-flex flex-wrap gap-1 mt-2">
                    <LedgerStatusChip entry={item} />
                    <LedgerSourceChips sources={item.sources} />
                  </div>
                  {item.status === 'void' && item.voidReason && (
                    <div style={{ fontSize: 12, color: '#6F767E', marginTop: 6, fontFamily: OHGO_FONT }}>
                      제외 사유: {item.voidReason}
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="d-flex flex-column gap-1 align-items-end">
                    {item.status === 'void' ? (
                      <button
                        type="button"
                        style={SMALL_BTN}
                        disabled={busy}
                        onClick={() =>
                          void run((l) => l.restoreBoarding({ id: item.id, actor: actorArg() }), '제외를 취소했습니다.')
                        }
                      >
                        제외 취소
                      </button>
                    ) : (
                      <>
                        {item.needsReview && (
                          <button
                            type="button"
                            style={{ ...SMALL_BTN, color: '#1B6FF5', borderColor: '#BFD6FF' }}
                            disabled={busy}
                            onClick={() =>
                              void run((l) => l.confirmBoarding({ id: item.id, actor: actorArg() }), '승선으로 확인했습니다.')
                            }
                          >
                            승선 확인
                          </button>
                        )}
                        <button
                          type="button"
                          style={{ ...SMALL_BTN, color: '#E5484D', borderColor: '#F8CFD0' }}
                          disabled={busy}
                          onClick={() => {
                            setVoidReason(VOID_REASONS[0]);
                            setVoidTarget(voidTarget === item.id ? null : item.id);
                          }}
                        >
                          제외
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {canManage && voidTarget === item.id && (
                <div className="d-flex gap-2 mt-3">
                  <select
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    style={{ ...OHGO_INPUT, flex: 1, minWidth: 0 }}
                    aria-label="제외 사유"
                  >
                    {VOID_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    style={{ ...SMALL_BTN, background: '#E5484D', color: '#FFFFFF', borderColor: '#E5484D' }}
                    disabled={busy}
                    onClick={() => void handleVoid(item)}
                  >
                    제외하기
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {legacy?.map((item) => (
          <div key={`${item.date}-${item.tripNumber}`} className="p-3" style={OHGO_CARD}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT }}>
              {item.date}
            </div>
            <div style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT, marginTop: 4 }}>
              {item.tripNumber}항차
            </div>
          </div>
        ))}
      </div>

      {loaded && visible.length === 0 && (legacy?.length ?? 0) === 0 && (
        <EmptyState icon={IoBoatOutline} message="기록된 승선일이 없습니다." style={OHGO_CARD} />
      )}
    </SubPageFrame>
  );
}

export default function BoardingHistoryPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <BoardingHistoryPageContent />
    </Suspense>
  );
}
