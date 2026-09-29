'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import SubPageFrame from '@/components/SubPageFrame';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_LIST_DIVIDER,
  OhgoPageLoading,
} from '@/lib/page-styles';
import { useRequireStaff } from '@/hooks/useRequireStaff';
import { staffFetch } from '@/lib/staff-client';
import { getTodayDate } from '@/lib/kst-date';
import { ohgoAlert, ohgoConfirm } from '@/lib/ohgo-dialog';
import { boardCheckKindLabel, type BoardCheckKind, type CorrectionChoice } from '@/lib/reconcile-boarding.shared';
import type { BoardCheckMember, BoardCheckReport } from '@/lib/board-check';
import { IoBoatOutline, IoWarningOutline } from 'react-icons/io5';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';

type ChoiceMap = Record<string, CorrectionChoice>;

const KIND_COLOR: Record<BoardCheckKind, { fg: string; bg: string }> = {
  OK: { fg: '#2E7D32', bg: '#E8F5E9' },
  NO_STAMP: { fg: '#C62828', bg: '#FFEBEE' },
  NO_BAIT: { fg: '#E65100', bg: '#FFF3E0' },
  NO_TRIP: { fg: '#6A1B9A', bg: '#F3E5F5' },
  ORPHAN: { fg: '#1565C0', bg: '#E3F2FD' },
  EXTRA: { fg: '#5D4037', bg: '#EFEBE9' },
};

function Flag({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span style={{ color: ok ? '#2E7D32' : '#C62828', fontWeight: 700 }}>
      {ok ? yes : no}
    </span>
  );
}

function KindBadge({ kind }: { kind: BoardCheckKind }) {
  const tone = KIND_COLOR[kind];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        fontFamily: OHGO_FONT,
        color: tone.fg,
        backgroundColor: tone.bg,
        borderRadius: 999,
        padding: '3px 8px',
        lineHeight: 1.2,
      }}
    >
      {boardCheckKindLabel(kind)}
    </span>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className="d-flex align-items-center gap-2"
      style={{ fontSize: 13, fontFamily: OHGO_FONT, color: '#1A1D1F', fontWeight: 600 }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18 }}
      />
      {label}
    </label>
  );
}

function MemberCard({
  row,
  choice,
  onChange,
}: {
  row: BoardCheckMember;
  choice: CorrectionChoice;
  onChange: (next: CorrectionChoice) => void;
}) {
  const showMove = row.hasOrphanStamp && !row.hasStamp;
  const showStamp = row.onRoster && !row.isCrew && !row.hasStamp && !row.hasOrphanStamp;
  const showBait =
    !row.baitAwarded && (row.hasStamp || row.hasOrphanStamp || (row.onRoster && !row.isCrew));
  const showTrip = row.onRoster && !row.isCrew && !row.tripCredited;
  const canCorrect = showMove || showStamp || showBait || showTrip;

  return (
    <div style={{ padding: '14px 16px' }}>
      <div className="d-flex align-items-start justify-content-between gap-2">
        <div className="min-w-0">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: OHGO_FONT, color: '#1A1D1F' }}>
              {row.name || '이름 없음'}
            </span>
            {row.isCrew && (
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
                선장·선원
              </span>
            )}
            <KindBadge kind={row.kind} />
          </div>
          <div style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT, marginTop: 6, lineHeight: 1.5 }}>
            스탬프 <Flag ok={row.hasStamp || row.hasOrphanStamp} yes="있음" no="없음" />
            {' · '}
            승선일수 <Flag ok={row.tripCredited} yes="반영" no="미반영" />
            {' · '}
            미끼 <Flag ok={row.baitAwarded} yes="지급" no="미지급" />
          </div>
        </div>
      </div>
      {canCorrect && (
        <div className="d-flex flex-wrap gap-3 mt-3">
          {showMove && (
            <CheckRow
              label="병합 스탬프 옮기기"
              checked={Boolean(choice.moveOrphan || choice.addStamp)}
              onChange={(next) => onChange({ ...choice, moveOrphan: next, addStamp: next })}
            />
          )}
          {showStamp && (
            <CheckRow
              label="스탬프 넣기"
              checked={Boolean(choice.addStamp)}
              onChange={(next) => onChange({ ...choice, addStamp: next })}
            />
          )}
          {showBait && (
            <CheckRow
              label="미끼 주기"
              checked={Boolean(choice.grantBait)}
              onChange={(next) => onChange({ ...choice, grantBait: next })}
            />
          )}
          {showTrip && (
            <CheckRow
              label="승선일수 반영"
              checked={Boolean(choice.creditTrip)}
              onChange={(next) => onChange({ ...choice, creditTrip: next })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function RosterCheckContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready } = useRequireStaff();
  const initialDate = searchParams.get('date') || getTodayDate();
  const initialTrip = Number(searchParams.get('tripNumber') || searchParams.get('trip') || 1);
  const justConfirmed = searchParams.get('justConfirmed') === '1';

  const [date, setDate] = useState(initialDate);
  const [trip, setTrip] = useState(initialTrip === 2 || initialTrip === 3 ? initialTrip : 1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<BoardCheckReport | null>(null);
  const [choices, setChoices] = useState<ChoiceMap>({});

  const load = useCallback(async (nextDate = date, nextTrip = trip) => {
    setLoading(true);
    setError('');
    try {
      const res = await staffFetch(
        `/api/admin/roster-check?date=${encodeURIComponent(nextDate)}&tripNumber=${nextTrip}`
      );
      const json = (await res.json()) as BoardCheckReport & { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || '명단을 불러오지 못했습니다.');
      }
      setReport(json);
      setChoices({});
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : '명단을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [date, trip]);

  useEffect(() => {
    if (!ready) return;
    void load(initialDate, trip);
    // first load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useNativePullToRefresh(async () => {
    if (ready) await load();
  });

  const selectedCount = useMemo(() => {
    return Object.values(choices).filter(
      (c) => c.addStamp || c.grantBait || c.creditTrip || c.moveOrphan
    ).length;
  }, [choices]);

  const apply = async () => {
    const items = Object.entries(choices)
      .filter(([, c]) => c.addStamp || c.grantBait || c.creditTrip || c.moveOrphan)
      .map(([realId, c]) => ({ realId, ...c }));
    if (!items.length) {
      await ohgoAlert('보정할 항목을 선택해 주세요.');
      return;
    }
    const ok = await ohgoConfirm(
      `${items.length}명에 대해 선택한 보정을 적용할까요?\n이미 있는 스탬프·미끼·승선일수는 다시 올리지 않습니다.`
    );
    if (!ok) return;

    setSaving(true);
    try {
      const res = await staffFetch('/api/admin/roster-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, tripNumber: trip, items }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        applied?: unknown[];
        skipped?: string[];
        report?: BoardCheckReport;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || '보정에 실패했습니다.');
      }
      if (json.report) setReport(json.report);
      setChoices({});
      const applied = json.applied?.length ?? 0;
      const skipped = json.skipped?.length ?? 0;
      await ohgoAlert(
        skipped
          ? `${applied}명 반영, ${skipped}명은 이미 처리되어 건너뛰었습니다.`
          : `${applied}명 반영했습니다.`
      );
    } catch (e) {
      await ohgoAlert(e instanceof Error ? e.message : '보정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <OhgoPageLoading />;

  const members = report?.members ?? [];
  const extras = report?.extras ?? [];
  const missing = report?.missingStampCount ?? 0;

  return (
    <SubPageFrame title="명단 대조" onRefresh={() => load()} dense>
      {justConfirmed && report && (
        <div
          className="mb-3 d-flex align-items-start gap-2"
          style={{
            ...OHGO_CARD,
            padding: '12px 14px',
            backgroundColor: missing ? '#FFF3E0' : '#E8F5E9',
          }}
        >
          <IoWarningOutline size={18} color={missing ? '#E65100' : '#2E7D32'} className="flex-shrink-0 mt-1" />
          <div style={{ fontFamily: OHGO_FONT, fontSize: 13, lineHeight: 1.5, color: '#1A1D1F' }}>
            출항이 확정되었습니다.{' '}
            {missing > 0 ? (
              <strong>{missing}명 스탬프 누락</strong>
            ) : (
              <strong>스탬프가 모두 있습니다.</strong>
            )}
          </div>
        </div>
      )}

      <div className="mb-3" style={{ ...OHGO_CARD, padding: 14 }}>
        <div className="d-flex align-items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ ...OHGO_INPUT, flex: 1, minWidth: 0 }}
          />
          <div className="d-flex gap-1 flex-shrink-0">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTrip(n)}
                className="btn"
                style={{
                  minWidth: 44,
                  height: 40,
                  borderRadius: 10,
                  border: trip === n ? 'none' : '1px solid #EFEFEF',
                  backgroundColor: trip === n ? '#1B6FF5' : '#FFFFFF',
                  color: trip === n ? '#FFFFFF' : '#1A1D1F',
                  fontFamily: OHGO_FONT,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {n}항
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn w-100 mt-2"
          style={{
            height: 40,
            borderRadius: 10,
            border: 'none',
            backgroundColor: '#EDF5FF',
            color: '#237FFF',
            fontFamily: OHGO_FONT,
            fontWeight: 700,
            fontSize: 14,
          }}
          onClick={() => {
            router.replace(`/roster-check?date=${date}&tripNumber=${trip}`);
            void load(date, trip);
          }}
        >
          이 날짜·항차 보기
        </button>
      </div>

      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary mb-2" role="status" />
          <p className="mb-0" style={{ fontSize: 13, color: '#6F767E', fontFamily: OHGO_FONT }}>
            확정 명단과 스탬프를 대조하는 중…
          </p>
        </div>
      ) : error ? (
        <EmptyState icon={IoWarningOutline} message={error} style={OHGO_CARD} />
      ) : !report?.confirmed ? (
        <EmptyState
          icon={IoBoatOutline}
          message="아직 출항 확정 전입니다."
          subtitle="확정 후에 명단과 스탬프를 대조할 수 있습니다."
          style={OHGO_CARD}
        />
      ) : members.length === 0 && extras.length === 0 ? (
        <EmptyState icon={IoBoatOutline} message="확정 명단에 회원이 없습니다." style={OHGO_CARD} />
      ) : (
        <>
          <div
            className="mb-3"
            style={{ fontFamily: OHGO_FONT, fontSize: 13, color: '#6F767E', padding: '0 2px' }}
          >
            확정 {members.length}명
            {missing > 0 ? ` · 스탬프 누락 ${missing}명` : ''}
            {extras.length > 0 ? ` · 명단 외 ${extras.length}명` : ''}
          </div>

          <div className="mb-3" style={{ ...OHGO_CARD, overflow: 'hidden' }}>
            {members.map((row, i) => (
              <div key={row.realId}>
                {i > 0 && <div style={OHGO_LIST_DIVIDER} />}
                <MemberCard
                  row={row}
                  choice={choices[row.realId] ?? {}}
                  onChange={(next) => setChoices((prev) => ({ ...prev, [row.realId]: next }))}
                />
              </div>
            ))}
          </div>

          {extras.length > 0 && (
            <>
              <div
                className="mb-2"
                style={{ fontFamily: OHGO_FONT, fontSize: 13, fontWeight: 700, color: '#5D4037', padding: '0 2px' }}
              >
                명단에 없는 스탬프
              </div>
              <div className="mb-3" style={{ ...OHGO_CARD, overflow: 'hidden' }}>
                {extras.map((row, i) => (
                  <div key={row.realId}>
                    {i > 0 && <div style={OHGO_LIST_DIVIDER} />}
                    <MemberCard
                      row={row}
                      choice={choices[row.realId] ?? {}}
                      onChange={(next) => setChoices((prev) => ({ ...prev, [row.realId]: next }))}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            className={`btn w-100 ${OHGO_CONFIRM_BTN_CLASS}`}
            style={{ ...OHGO_CONFIRM_BTN, opacity: saving ? 0.65 : 1 }}
            disabled={saving || selectedCount === 0}
            onClick={() => void apply()}
          >
            {saving ? '반영 중…' : selectedCount > 0 ? `선택한 ${selectedCount}명 보정` : '보정할 항목을 선택'}
          </button>
        </>
      )}
    </SubPageFrame>
  );
}

export default function RosterCheckPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <RosterCheckContent />
    </Suspense>
  );
}
