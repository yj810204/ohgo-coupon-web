'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  TripGuideInput,
  getAllTrips,
  addTrip,
  updateTrip,
} from '@/utils/trip-guide-service';
import { IoCheckmarkOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
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
          onChange={e => onChange(combineTime(e.target.value, minute || '00'))}
          style={SELECT_STYLE}
        >
          <option value="">시</option>
          {HOURS.map(h => (
            <option key={h} value={h}>
              {h}시
            </option>
          ))}
        </select>
        <select
          className="form-select flex-grow-1"
          value={hour ? minute : ''}
          onChange={e => onChange(combineTime(hour, e.target.value))}
          disabled={!hour}
          style={SELECT_STYLE}
        >
          <option value="">분</option>
          {MINUTES.map(m => (
            <option key={m} value={m}>
              {m}분
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const TEXT_FIELDS_BEFORE_TIME: {
  label: string;
  key: keyof TripGuideInput;
  type: string;
  placeholder?: string;
  required?: boolean;
}[] = [
  { label: '날짜', key: 'date', type: 'date', required: true },
  { label: '목적지', key: 'destination', type: 'text', placeholder: '예: 나무섬, 형제섬 등', required: true },
];

const TEXT_FIELDS_AFTER_TIME: {
  label: string;
  key: keyof TripGuideInput;
  type: string;
  placeholder?: string;
}[] = [
  { label: '목표 어종', key: 'species', type: 'text', placeholder: '예: 참돔, 광어' },
  { label: '1인 요금 (원)', key: 'price', type: 'number', placeholder: '0' },
  { label: '예약 문의 (연락처)', key: 'contact', type: 'text', placeholder: '010-0000-0000' },
];

function toPayload(form: TripGuideInput): TripGuideInput {
  const { capacity: _omit, ...rest } = form;
  return rest;
}

function TripGuideFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const { ready } = useRequireAdmin();
  const [form, setForm] = useState<TripGuideInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loadingTrip, setLoadingTrip] = useState(!!editId);

  useEffect(() => {
    if (!ready) return;
    if (!editId) {
      setForm({ ...EMPTY, date: new Date().toISOString().split('T')[0] });
      return;
    }
    const load = async () => {
      setLoadingTrip(true);
      try {
        const trips = await getAllTrips();
        const t = trips.find(x => x.id === editId);
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
          price: t.price,
          notes: t.notes || '',
          contact: t.contact || '',
        });
      } finally {
        setLoadingTrip(false);
      }
    };
    void load();
  }, [ready, editId, router]);

  const setField = <K extends keyof TripGuideInput>(key: K, value: TripGuideInput[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.date || !form.destination || !form.departureTime) {
      alert('날짜, 목적지, 출발 시간은 필수입니다.');
      return;
    }
    const payload = toPayload(form);
    setSaving(true);
    try {
      if (editId) {
        await updateTrip(editId, payload);
      } else {
        await addTrip(payload);
      }
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
      {TEXT_FIELDS_BEFORE_TIME.map(({ label, key, type, placeholder, required }) => (
        <div key={key} className="mb-3">
          <label style={LABEL}>
            {label}
            {required && ' *'}
          </label>
          <input
            type={type}
            value={(form[key] as string | undefined) ?? ''}
            onChange={e => setField(key, e.target.value as TripGuideInput[typeof key])}
            placeholder={placeholder}
            className="form-control"
            style={OHGO_INPUT}
          />
        </div>
      ))}

      <TimeSelect
        label="출발 시간"
        required
        value={form.departureTime}
        onChange={time => setField('departureTime', time)}
      />
      <TimeSelect label="귀항 예정" value={form.returnTime || ''} onChange={time => setField('returnTime', time)} />

      {TEXT_FIELDS_AFTER_TIME.map(({ label, key, type, placeholder }) => (
        <div key={key} className="mb-3">
          <label style={LABEL}>{label}</label>
          <input
            type={type}
            value={(form[key] as string | number | undefined) ?? ''}
            onChange={e => {
              const v =
                type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value;
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
          onChange={e => setField('notes', e.target.value)}
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
          {editId ? '수정' : '저장'}
        </button>
      </div>
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
