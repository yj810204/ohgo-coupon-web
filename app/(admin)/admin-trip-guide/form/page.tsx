'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import {
  TripGuideInput,
  getAllTrips,
  addTrip,
  updateTrip,
} from '@/utils/trip-guide-service';
import { IoCalendarOutline, IoCheckmarkOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import DateRangeCalendar from '@/components/DateRangeCalendar';
import { useRequireAdmin } from '@/hooks/useRequireAdmin';
import {
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OhgoPageLoading,
} from '@/lib/page-styles';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '30'];

const EMPTY: TripGuideInput = {
  date: '',
  destination: '',
  departureTime: '',
  returnTime: '',
  species: '',
  capacity: undefined,
  price: undefined,
  notes: '',
  contact: '',
};

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  marginBottom: 6,
  display: 'block',
};

const SELECT_STYLE: React.CSSProperties = {
  ...OHGO_INPUT,
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  paddingRight: 36,
  cursor: 'pointer',
};

function parseTime(value: string): { hour: string; minute: string } {
  if (!value?.includes(':')) return { hour: '', minute: '00' };
  const [h, m] = value.split(':');
  const hour = String(Number(h)).padStart(2, '0');
  const minute = m?.startsWith('3') ? '30' : '00';
  return { hour: HOURS.includes(hour) ? hour : '', minute };
}

function combineTime(hour: string, minute: string): string {
  if (!hour) return '';
  return `${hour}:${minute || '00'}`;
}

function TimeSelect({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (time: string) => void;
}) {
  const { hour, minute } = parseTime(value);

  return (
    <div className="mb-3">
      <label style={LABEL}>
        {label}
        {required && ' *'}
      </label>
      <div className="d-flex gap-2 align-items-center">
        <select
          className="form-select flex-grow-1"
          value={hour}
          onChange={(e) => onChange(combineTime(e.target.value, minute || '00'))}
          style={SELECT_STYLE}
        >
          <option value="">시</option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}시
            </option>
          ))}
        </select>
        <select
          className="form-select flex-grow-1"
          value={hour ? minute : ''}
          onChange={(e) => onChange(combineTime(hour, e.target.value))}
          disabled={!hour}
          style={SELECT_STYLE}
        >
          <option value="">분</option>
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}분
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return format(parseISO(dateStr), 'yyyy. MM. dd');
  } catch {
    return dateStr;
  }
}

function datesInRange(start: string, end: string): string[] {
  if (!start || !end) return [];
  try {
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    if (startDate > endDate) return [];
    return eachDayOfInterval({ start: startDate, end: endDate }).map((d) => format(d, 'yyyy-MM-dd'));
  } catch {
    return [];
  }
}

function toPayload(form: TripGuideInput): TripGuideInput {
  const payload: TripGuideInput = {
    date: form.date,
    destination: form.destination.trim(),
    departureTime: form.departureTime,
    returnTime: form.returnTime?.trim() || undefined,
    species: form.species?.trim() || undefined,
    notes: form.notes?.trim() || undefined,
    contact: form.contact?.trim() || undefined,
  };
  const capacity = form.capacity;
  if (typeof capacity === 'number' && !Number.isNaN(capacity) && capacity > 0) {
    payload.capacity = capacity;
  }
  const price = form.price;
  if (typeof price === 'number' && !Number.isNaN(price) && price > 0) {
    payload.price = price;
  }
  return payload;
}

const TEXT_FIELDS_AFTER_TIME: {
  label: string;
  key: keyof TripGuideInput;
  type: string;
  placeholder?: string;
}[] = [
  { label: '목표 어종', key: 'species', type: 'text', placeholder: '예: 참돔, 광어' },
  { label: '정원 (명)', key: 'capacity', type: 'number', placeholder: '미입력 시 제한 없음' },
  { label: '1인 요금 (원)', key: 'price', type: 'number', placeholder: '0' },
  { label: '예약 문의 (연락처)', key: 'contact', type: 'text', placeholder: '010-0000-0000' },
];

function TripGuideFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const { ready } = useRequireAdmin();
  const [form, setForm] = useState<TripGuideInput>(EMPTY);
  const [dateEnd, setDateEnd] = useState('');
  const [rangeDraftStart, setRangeDraftStart] = useState('');
  const [rangeDraftEnd, setRangeDraftEnd] = useState('');
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingTrip, setLoadingTrip] = useState(!!editId);

  const isEdit = Boolean(editId);

  useEffect(() => {
    if (!ready) return;
    if (!editId) {
      const today = new Date().toISOString().split('T')[0];
      setForm({ ...EMPTY, date: today });
      setDateEnd(today);
      return;
    }
    const load = async () => {
      setLoadingTrip(true);
      try {
        const trips = await getAllTrips();
        const t = trips.find((x) => x.id === editId);
        if (!t) {
          alert('출조 일정을 찾을 수 없습니다.');
          router.replace('/admin-trip-guide');
          return;
        }
        setForm({
          date: t.date,
          destination: t.destination,
          departureTime: t.departureTime,
          returnTime: t.returnTime || '',
          species: t.species || '',
          capacity: t.capacity,
          price: t.price,
          notes: t.notes || '',
          contact: t.contact || '',
        });
        setDateEnd(t.date);
      } finally {
        setLoadingTrip(false);
      }
    };
    void load();
  }, [ready, editId, router]);

  const setField = <K extends keyof TripGuideInput>(key: K, value: TripGuideInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const selectedDates = useMemo(() => {
    if (isEdit) return form.date ? [form.date] : [];
    return datesInRange(form.date, dateEnd || form.date);
  }, [isEdit, form.date, dateEnd]);

  const dateRangeLabel = useMemo(() => {
    if (!form.date) return '날짜 범위를 선택하세요';
    if (isEdit || !dateEnd || dateEnd === form.date) {
      return formatDisplayDate(form.date);
    }
    return `${formatDisplayDate(form.date)} ~ ${formatDisplayDate(dateEnd)}`;
  }, [form.date, dateEnd, isEdit]);

  const openRangeModal = () => {
    setRangeDraftStart(form.date || new Date().toISOString().split('T')[0]);
    setRangeDraftEnd(dateEnd || form.date || new Date().toISOString().split('T')[0]);
    setShowRangeModal(true);
  };

  const applyRange = () => {
    if (!rangeDraftStart) {
      alert('시작일을 선택해 주세요.');
      return;
    }
    // 종료일 미선택 시 하루만 등록
    const end = rangeDraftEnd || rangeDraftStart;
    if (rangeDraftStart > end) {
      alert('종료일은 시작일 이후여야 합니다.');
      return;
    }
    const days = datesInRange(rangeDraftStart, end);
    if (days.length === 0) {
      alert('유효한 날짜 범위가 아닙니다.');
      return;
    }
    if (days.length > 62) {
      alert('한 번에 등록할 수 있는 기간은 최대 62일입니다.');
      return;
    }
    setForm((f) => ({ ...f, date: rangeDraftStart }));
    setDateEnd(end);
    setShowRangeModal(false);
  };

  const handleSave = async () => {
    if (!form.date || !form.destination || !form.departureTime) {
      alert('날짜, 목적지, 출항 시간은 필수입니다.');
      return;
    }
    if (!isEdit && selectedDates.length === 0) {
      alert('날짜 범위를 선택해 주세요.');
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        await updateTrip(editId, toPayload(form));
        router.replace('/admin-trip-guide');
        return;
      }

      const base = toPayload(form);
      for (const date of selectedDates) {
        await addTrip({ ...base, date });
      }
      alert(
        selectedDates.length > 1
          ? `${selectedDates.length}일 일정이 등록되었습니다. (${base.departureTime} 출항)`
          : '일정이 등록되었습니다.'
      );
      router.replace('/admin-trip-guide');
    } catch (e) {
      alert('저장 중 오류가 발생했습니다.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!ready || loadingTrip) {
    return <OhgoPageLoading />;
  }

  return (
    <SubPageFrame title={editId ? '출조 일정 수정' : '새 출조 일정'}>
      <div className="mb-3">
        <label style={LABEL}>
          {isEdit ? '날짜' : '날짜 범위'} *
        </label>
        {isEdit ? (
          <input
            type="date"
            value={form.date}
            onChange={(e) => {
              setField('date', e.target.value);
              setDateEnd(e.target.value);
            }}
            className="form-control"
            style={OHGO_INPUT}
          />
        ) : (
          <>
            <button
              type="button"
              className="btn w-100 d-flex align-items-center justify-content-between"
              onClick={openRangeModal}
              style={{
                ...OHGO_INPUT,
                textAlign: 'left',
                backgroundColor: '#FFFFFF',
              }}
            >
              <span style={{ color: form.date ? '#1A1D1F' : '#9CA3AF' }}>{dateRangeLabel}</span>
              <IoCalendarOutline size={18} color="#1B6FF5" />
            </button>
            {selectedDates.length > 1 ? (
              <p
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  fontSize: 12,
                  color: '#6F767E',
                  fontFamily: OHGO_FONT,
                }}
              >
                {selectedDates.length}일 · 같은 출항 시간으로 일괄 등록됩니다
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="mb-3">
        <label style={LABEL}>목적지 *</label>
        <input
          type="text"
          value={form.destination}
          onChange={(e) => setField('destination', e.target.value)}
          placeholder="예: 나무섬, 형제섬 등"
          className="form-control"
          style={OHGO_INPUT}
        />
      </div>

      <TimeSelect
        label="출항 시간"
        required
        value={form.departureTime}
        onChange={(time) => setField('departureTime', time)}
      />
      <TimeSelect
        label="귀항 예정"
        value={form.returnTime || ''}
        onChange={(time) => setField('returnTime', time)}
      />

      {TEXT_FIELDS_AFTER_TIME.map(({ label, key, type, placeholder }) => (
        <div key={key} className="mb-3">
          <label style={LABEL}>{label}</label>
          <input
            type={type}
            value={(form[key] as string | number | undefined) ?? ''}
            onChange={(e) => {
              const v =
                type === 'number'
                  ? (() => {
                      if (e.target.value === '') return undefined;
                      const n = Number(e.target.value);
                      return Number.isNaN(n) ? undefined : n;
                    })()
                  : e.target.value;
              setField(key, v as TripGuideInput[typeof key]);
            }}
            placeholder={placeholder}
            className="form-control"
            style={OHGO_INPUT}
          />
        </div>
      ))}

      <div className="mb-4">
        <label style={LABEL}>비고 / 상세내용</label>
        <textarea
          value={form.notes || ''}
          onChange={(e) => setField('notes', e.target.value)}
          placeholder="집결 장소, 준비물, 주의사항 등"
          rows={4}
          className="form-control"
          style={{ ...OHGO_INPUT, resize: 'none' }}
        />
      </div>

      <div className="d-flex gap-2">
        <button
          type="button"
          className={`btn flex-grow-1 fw-semibold ${OHGO_DISMISS_BTN_CLASS}`}
          onClick={() => router.back()}
          style={OHGO_DISMISS_BTN}
        >
          취소
        </button>
        <button
          type="button"
          className={`btn flex-grow-1 fw-semibold d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
          onClick={() => void handleSave()}
          disabled={saving}
          style={OHGO_CONFIRM_BTN}
        >
          {saving ? <span className="spinner-border spinner-border-sm" /> : <IoCheckmarkOutline size={18} />}
          {editId ? '수정' : selectedDates.length > 1 ? `${selectedDates.length}일 등록` : '저장'}
        </button>
      </div>

      <OhgoModal
        open={showRangeModal}
        onClose={() => setShowRangeModal(false)}
        title="날짜 선택"
        size="lg"
        closeOnBackdrop
        footer={
          <>
            <OhgoModalButton variant="secondary" onClick={() => setShowRangeModal(false)}>
              취소
            </OhgoModalButton>
            <OhgoModalButton variant="primary" onClick={applyRange}>
              적용
            </OhgoModalButton>
          </>
        }
      >
        <DateRangeCalendar
          startDate={rangeDraftStart}
          endDate={rangeDraftEnd}
          onChange={(start, end) => {
            setRangeDraftStart(start);
            setRangeDraftEnd(end);
          }}
        />
      </OhgoModal>
    </SubPageFrame>
  );
}

export default function AdminTripGuideFormPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <TripGuideFormContent />
    </Suspense>
  );
}
