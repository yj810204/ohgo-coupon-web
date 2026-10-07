'use client';

import { useState } from 'react';
import KoreanDateField from '@/components/pickers/KoreanDateField';
import KoreanDateTimeField from '@/components/pickers/KoreanDateTimeField';
import KoreanTimeField from '@/components/pickers/KoreanTimeField';
import SubPageFrame from '@/components/SubPageFrame';
import { OHGO_CARD, OHGO_FONT, OHGO_INPUT } from '@/lib/page-styles';

const LABEL = {
  fontSize: 12,
  fontWeight: 700,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  marginBottom: 6,
} as const;

export default function KoreanPickerSamplePage() {
  const [start, setStart] = useState('2026-10-03');
  const [end, setEnd] = useState('2026-10-09');
  const [depart, setDepart] = useState('06:30');
  const [arrive, setArrive] = useState('');
  const [tournamentStart, setTournamentStart] = useState('2026-10-07T14:05');
  const [tournamentEnd, setTournamentEnd] = useState('');

  return (
    <SubPageFrame title="날짜 시간 선택" showBackButton={false}>
      <div className="p-3 mb-3" style={OHGO_CARD}>
        <div style={{ ...LABEL, marginBottom: 10 }}>승선 기간</div>
        <div className="d-flex align-items-center gap-2">
          <KoreanDateField
            value={start}
            onChange={setStart}
            style={{ ...OHGO_INPUT, flex: 1, minWidth: 0 }}
            ariaLabel="시작일"
          />
          <span style={{ color: '#6F767E', fontFamily: OHGO_FONT }}>~</span>
          <KoreanDateField
            value={end}
            onChange={setEnd}
            min={start}
            style={{ ...OHGO_INPUT, flex: 1, minWidth: 0 }}
            ariaLabel="종료일"
          />
        </div>
        <p data-testid="range-value" style={{ margin: '8px 0 0', fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>
          {start} ~ {end}
        </p>
      </div>

      <div className="p-3 mb-3" style={OHGO_CARD}>
        <div style={{ ...LABEL, marginBottom: 10 }}>조업일지</div>
        <div className="row g-2">
          <div className="col-6">
            <div style={LABEL}>출항</div>
            <KoreanTimeField
              value={depart}
              onChange={setDepart}
              style={OHGO_INPUT}
              ariaLabel="출항"
            />
          </div>
          <div className="col-6">
            <div style={LABEL}>입항</div>
            <KoreanTimeField
              value={arrive}
              onChange={setArrive}
              style={OHGO_INPUT}
              ariaLabel="입항"
            />
          </div>
        </div>
        <p data-testid="time-value" style={{ margin: '8px 0 0', fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>
          {depart || '출항 없음'} / {arrive || '입항 없음'}
        </p>
      </div>

      <div className="p-3 mb-3" style={OHGO_CARD}>
        <div style={{ ...LABEL, marginBottom: 10 }}>대회 기간</div>
        <div className="mb-2">
          <div style={LABEL}>시작일</div>
          <KoreanDateTimeField
            value={tournamentStart}
            onChange={setTournamentStart}
            style={OHGO_INPUT}
            ariaLabel="대회 시작"
          />
        </div>
        <div>
          <div style={LABEL}>종료일</div>
          <KoreanDateTimeField
            value={tournamentEnd}
            onChange={setTournamentEnd}
            style={OHGO_INPUT}
            ariaLabel="대회 종료"
          />
        </div>
        <p data-testid="datetime-value" style={{ margin: '8px 0 0', fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT }}>
          {tournamentStart || '시작 없음'} ~ {tournamentEnd || '종료 없음'}
        </p>
      </div>
    </SubPageFrame>
  );
}
