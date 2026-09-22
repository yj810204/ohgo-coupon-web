'use client';

import { useEffect, useState } from 'react';
import OhgoModal, { OhgoModalButton, OhgoModalCancelLink } from '@/components/OhgoModal';
import { OHGO_FONT } from '@/lib/page-styles';
import { getAttendance, loadDailyRoster, type RosterItem } from '@/utils/roster-service';
import { IoCheckmarkCircleOutline, IoPersonOutline } from 'react-icons/io5';

const FONT = OHGO_FONT;

type Props = {
  open: boolean;
  onClose: () => void;
  tripDate: string;
  initialTripNumber?: number;
  initialSelectedIds?: string[];
  onConfirm: (passengers: RosterItem[]) => void;
  loading?: boolean;
};

export default function PassengerTagModal({
  open,
  onClose,
  tripDate,
  initialTripNumber = 1,
  initialSelectedIds = [],
  onConfirm,
  loading = false,
}: Props) {
  const [tripNumber, setTripNumber] = useState(initialTripNumber);
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTripNumber(initialTripNumber);
    setSelected(new Set(initialSelectedIds));
  }, [open, initialTripNumber, initialSelectedIds]);

  useEffect(() => {
    if (!open || !tripDate) return;

    const load = async () => {
      setFetching(true);
      try {
        await getAttendance(tripDate);
        const members = await loadDailyRoster(tripDate, tripNumber);
        const passengers = members.filter((m) => !m.isCaptain && !m.isSailor);
        setRoster(passengers);
      } catch (e) {
        console.error(e);
        alert('승선명부를 불러오지 못했습니다.');
        setRoster([]);
      } finally {
        setFetching(false);
      }
    };

    void load();
  }, [open, tripDate, tripNumber]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const picked = roster.filter((m) => selected.has(m.id));
    onConfirm(picked);
  };

  return (
    <OhgoModal
      open={open}
      onClose={onClose}
      title="승객 태깅"
      size="default"
      scrollable
      closeOnBackdrop={!loading}
      footer={
        <>
          <OhgoModalButton onClick={handleConfirm} disabled={loading || selected.size === 0}>
            {loading ? '저장 중...' : `${selected.size}명 태깅`}
          </OhgoModalButton>
          <OhgoModalCancelLink onClick={onClose} disabled={loading} />
        </>
      }
    >
      <p style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginBottom: 12 }}>
        {tripDate} 출조 승선명부에서 사진에 태깅할 승객을 선택하세요.
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: FONT }}>
          출조 회차
        </label>
        <select
          value={tripNumber}
          onChange={(e) => setTripNumber(Number(e.target.value))}
          className="form-select mt-1"
          style={{ fontFamily: FONT, borderRadius: 10 }}
        >
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}회차
            </option>
          ))}
        </select>
      </div>

      {fetching ? (
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
        </div>
      ) : roster.length === 0 ? (
        <p style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center', padding: '24px 0' }}>
          해당 날짜 승선명부에 승객이 없습니다.
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {roster.map((member) => {
            const checked = selected.has(member.id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => toggle(member.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: checked ? '2px solid #1B6FF5' : '2px solid #EFEFEF',
                  backgroundColor: checked ? '#EBF1FE' : '#FAFAFA',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: checked ? '#1B6FF5' : '#E5E7EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {checked ? (
                    <IoCheckmarkCircleOutline size={20} color="#fff" />
                  ) : (
                    <IoPersonOutline size={18} color="#9CA3AF" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                    {member.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF', fontFamily: FONT }}>
                    {member.phone || '연락처 없음'}
                    {!member.hasRoster && ' · 명부 미작성'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </OhgoModal>
  );
}
