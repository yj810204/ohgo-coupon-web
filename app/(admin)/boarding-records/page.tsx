'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { IoDownloadOutline, IoStatsChartOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import LedgerRangeFilter, { rangeForPreset, type LedgerRangePreset } from '@/components/boarding/LedgerRangeFilter';
import { useNavigation } from '@/hooks/useNavigation';
import { useStaffActor } from '@/hooks/useStaffActor';
import { isFirebaseDataSource } from '@/lib/data-source';
import { ohgoAlert } from '@/lib/ohgo-dialog';
import {
  summarizeRange,
  toCsv,
  type BoardingRange,
  type LedgerEntry,
} from '@/lib/boarding-ledger.shared';
import { OHGO_CARD, OHGO_FONT, OhgoPageLoading } from '@/lib/page-styles';

type Tab = 'trips' | 'members';

const TH: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#6F767E',
  padding: '10px 12px',
  borderBottom: '1px solid #E6E8EC',
  whiteSpace: 'nowrap',
  fontFamily: OHGO_FONT,
};
const TD: React.CSSProperties = {
  fontSize: 14,
  color: '#1A1D1F',
  padding: '10px 12px',
  borderBottom: '1px solid #F1F3F5',
  whiteSpace: 'nowrap',
  fontFamily: OHGO_FONT,
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-fill text-center" style={{ padding: '12px 4px' }}>
      <div style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1D1F', fontFamily: OHGO_FONT }}>{value}</div>
    </div>
  );
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BoardingRecordsPage() {
  const { ready } = useStaffActor({ requireStaff: true });
  const { navigate } = useNavigation();
  const [preset, setPreset] = useState<LedgerRangePreset>('thisMonth');
  const [range, setRange] = useState<BoardingRange | null>(() => rangeForPreset('thisMonth'));
  const [tab, setTab] = useState<Tab>('trips');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!range || !isFirebaseDataSource()) {
      setLoaded(true);
      return;
    }
    setLoaded(false);
    const { listBoardingsInRange } = await import('@/utils/boarding-ledger.firebase');
    setEntries(await listBoardingsInRange(range));
    setLoaded(true);
  }, [range]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const summary = useMemo(() => summarizeRange(entries, range), [entries, range]);

  const exportCsv = async () => {
    if (!range) return;
    const suffix = `${range.startDate}_${range.endDate}`;
    if (tab === 'trips') {
      const rows: unknown[][] = [['날짜', '항차', '승객', '회원', '비회원', '선원']];
      for (const t of summary.trips) rows.push([t.date, t.tripNumber, t.passengers, t.members, t.guests, t.crew]);
      const sum = (pick: (t: (typeof summary.trips)[number]) => number) =>
        summary.trips.reduce((s, t) => s + pick(t), 0);
      rows.push([
        '합계',
        `${summary.totals.trips}항차`,
        summary.totals.passengers,
        sum((t) => t.members),
        summary.totals.guests,
        sum((t) => t.crew),
      ]);
      downloadCsv(`항차별_승선_${suffix}.csv`, toCsv(rows));
    } else {
      const rows: unknown[][] = [['이름', '승선 횟수', '마지막 승선일']];
      for (const m of summary.members) rows.push([m.name, m.boardings, m.lastDate]);
      downloadCsv(`회원별_승선_${suffix}.csv`, toCsv(rows));
    }
    await ohgoAlert('CSV 파일을 저장했습니다. 엑셀에서 열 수 있습니다.');
  };

  if (!ready) return <OhgoPageLoading />;

  if (!isFirebaseDataSource()) {
    return (
      <SubPageFrame title="기간별 승선기록">
        <EmptyState icon={IoStatsChartOutline} message="Firebase 운영 환경에서만 사용할 수 있습니다." style={OHGO_CARD} />
      </SubPageFrame>
    );
  }

  const empty = loaded && summary.trips.length === 0;

  return (
    <SubPageFrame title="기간별 승선기록" onRefresh={load}>
      <LedgerRangeFilter
        preset={preset}
        range={range}
        allowAll={false}
        onChange={(p, r) => {
          setPreset(p);
          setRange(r);
        }}
      />

      <div className="d-flex mb-3" style={OHGO_CARD}>
        <Stat label="출조 항차" value={summary.totals.trips} />
        <Stat label="승선 인원" value={summary.totals.passengers} />
        <Stat label="승선 회원" value={summary.totals.members} />
        <Stat label="비회원" value={summary.totals.guests} />
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <div className="d-flex gap-2">
          {(
            [
              ['trips', '항차별'],
              ['members', '회원별'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                border: 'none',
                borderRadius: 999,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: tab === id ? 700 : 500,
                background: tab === id ? '#1A1D1F' : '#F1F3F5',
                color: tab === id ? '#FFFFFF' : '#33383F',
                fontFamily: OHGO_FONT,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={empty}
          onClick={() => void exportCsv()}
          className="d-inline-flex align-items-center gap-1"
          style={{
            border: '1px solid #E6E8EC',
            background: '#FFFFFF',
            borderRadius: 10,
            padding: '6px 10px',
            fontSize: 13,
            fontWeight: 600,
            color: '#33383F',
            fontFamily: OHGO_FONT,
          }}
        >
          <IoDownloadOutline size={16} /> 엑셀(CSV)
        </button>
      </div>

      {!loaded && <OhgoPageLoading />}
      {empty && <EmptyState icon={IoStatsChartOutline} message="이 기간의 승선기록이 없습니다." style={OHGO_CARD} />}

      {loaded && !empty && (
        <div style={{ ...OHGO_CARD, padding: 0, overflowX: 'auto' }}>
          {tab === 'trips' ? (
            <table className="w-100" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>날짜</th>
                  <th style={TH}>항차</th>
                  <th style={{ ...TH, textAlign: 'right' }}>승객</th>
                  <th style={{ ...TH, textAlign: 'right' }}>비회원</th>
                  <th style={{ ...TH, textAlign: 'right' }}>선원</th>
                </tr>
              </thead>
              <tbody>
                {summary.trips.map((t) => (
                  <tr
                    key={`${t.date}_${t.tripNumber}`}
                    onClick={() => navigate(`/boarding-ledger?date=${t.date}&trip=${t.tripNumber}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={TD}>{t.date}</td>
                    <td style={TD}>{t.tripNumber}항차</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{t.passengers}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{t.guests}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{t.crew}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-100" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>이름</th>
                  <th style={{ ...TH, textAlign: 'right' }}>승선</th>
                  <th style={{ ...TH, textAlign: 'right' }}>마지막 승선일</th>
                </tr>
              </thead>
              <tbody>
                {summary.members.map((m) => (
                  <tr
                    key={m.userId}
                    onClick={() => navigate(`/boarding-history?uuid=${m.userId}&name=${encodeURIComponent(m.name)}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={TD}>{m.name}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{m.boardings}회</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{m.lastDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </SubPageFrame>
  );
}
