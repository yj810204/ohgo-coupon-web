'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resolveAppUser } from '@/lib/auth-session';
import { getProfileByUserId } from '@/lib/supabase-auth';
import {
  createLog,
  getLogById,
  parseSpeciesInput,
  updateLog,
  type FishingLogInput,
} from '@/utils/fishing-operation-service';
import { IoCheckmarkOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import {
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OhgoPageLoading,
} from '@/lib/page-styles';

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  marginBottom: 6,
  display: 'block',
};

const EMPTY: FishingLogInput & { speciesText: string } = {
  date: '',
  departureTime: '',
  arrivalTime: '',
  area: '',
  species: [],
  speciesText: '',
  catchKg: undefined,
  waterTemp: undefined,
  weather: '',
  revenue: undefined,
  notes: '',
};

function FishingLogFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      const profile = await getProfileByUserId(appUser.uuid);
      if (!profile || (profile.role !== 'admin' && profile.role !== 'captain')) {
        router.replace('/main');
        return;
      }
      setUserId(appUser.uuid);

      if (editId) {
        const log = await getLogById(editId);
        if (!log) {
          alert('기록을 찾을 수 없습니다.');
          router.back();
          return;
        }
        setForm({
          date: log.date,
          departureTime: log.departureTime ?? '',
          arrivalTime: log.arrivalTime ?? '',
          area: log.area ?? '',
          species: log.species,
          speciesText: log.species.join(', '),
          catchKg: log.catchKg,
          waterTemp: log.waterTemp,
          weather: log.weather ?? '',
          revenue: log.revenue,
          notes: log.notes ?? '',
        });
      } else {
        const today = new Date();
        const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        setForm({ ...EMPTY, date });
      }
      setReady(true);
    };
    void init();
  }, [router, editId]);

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.date) {
      alert('날짜를 입력해 주세요.');
      return;
    }

    const payload: FishingLogInput = {
      date: form.date,
      departureTime: form.departureTime?.trim() || undefined,
      arrivalTime: form.arrivalTime?.trim() || undefined,
      area: form.area?.trim() || undefined,
      species: parseSpeciesInput(form.speciesText),
      catchKg: form.catchKg != null && !Number.isNaN(Number(form.catchKg)) ? Number(form.catchKg) : undefined,
      waterTemp:
        form.waterTemp != null && !Number.isNaN(Number(form.waterTemp)) ? Number(form.waterTemp) : undefined,
      weather: form.weather?.trim() || undefined,
      revenue: form.revenue != null && !Number.isNaN(Number(form.revenue)) ? Number(form.revenue) : undefined,
      notes: form.notes?.trim() || undefined,
    };

    setSaving(true);
    try {
      if (editId) {
        await updateLog(editId, payload);
      } else {
        await createLog(payload, userId);
      }
      router.replace('/admin-fishing-log');
    } catch (e) {
      alert('저장 실패: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <OhgoPageLoading />;

  return (
    <SubPageFrame title={editId ? '조업일지 수정' : '조업일지 작성'}>
      <div className="mb-3">
        <label style={LABEL}>날짜 *</label>
        <input
          type="date"
          className="form-control"
          value={form.date}
          onChange={(e) => setField('date', e.target.value)}
          style={OHGO_INPUT}
        />
      </div>
      <div className="row g-2 mb-3">
        <div className="col-6">
          <label style={LABEL}>출항</label>
          <input
            type="time"
            className="form-control"
            value={form.departureTime}
            onChange={(e) => setField('departureTime', e.target.value)}
            style={OHGO_INPUT}
          />
        </div>
        <div className="col-6">
          <label style={LABEL}>귀항</label>
          <input
            type="time"
            className="form-control"
            value={form.arrivalTime}
            onChange={(e) => setField('arrivalTime', e.target.value)}
            style={OHGO_INPUT}
          />
        </div>
      </div>
      <div className="mb-3">
        <label style={LABEL}>해역</label>
        <input
          type="text"
          className="form-control"
          placeholder="예: 다대포, 내만"
          value={form.area}
          onChange={(e) => setField('area', e.target.value)}
          style={OHGO_INPUT}
        />
      </div>
      <div className="mb-3">
        <label style={LABEL}>어종 (쉼표로 구분)</label>
        <input
          type="text"
          className="form-control"
          placeholder="예: 참돔, 광어"
          value={form.speciesText}
          onChange={(e) => setField('speciesText', e.target.value)}
          style={OHGO_INPUT}
        />
      </div>
      <div className="row g-2 mb-3">
        <div className="col-6">
          <label style={LABEL}>어획량 (kg)</label>
          <input
            type="number"
            className="form-control"
            min={0}
            step="0.1"
            value={form.catchKg ?? ''}
            onChange={(e) => setField('catchKg', e.target.value ? Number(e.target.value) : undefined)}
            style={OHGO_INPUT}
          />
        </div>
        <div className="col-6">
          <label style={LABEL}>수온 (°C)</label>
          <input
            type="number"
            className="form-control"
            step="0.1"
            value={form.waterTemp ?? ''}
            onChange={(e) => setField('waterTemp', e.target.value ? Number(e.target.value) : undefined)}
            style={OHGO_INPUT}
          />
        </div>
      </div>
      <div className="row g-2 mb-3">
        <div className="col-6">
          <label style={LABEL}>기상</label>
          <input
            type="text"
            className="form-control"
            placeholder="맑음, 흐림 등"
            value={form.weather}
            onChange={(e) => setField('weather', e.target.value)}
            style={OHGO_INPUT}
          />
        </div>
        <div className="col-6">
          <label style={LABEL}>매출 (원)</label>
          <input
            type="number"
            className="form-control"
            min={0}
            value={form.revenue ?? ''}
            onChange={(e) => setField('revenue', e.target.value ? Number(e.target.value) : undefined)}
            style={OHGO_INPUT}
          />
        </div>
      </div>
      <div className="mb-4">
        <label style={LABEL}>메모</label>
        <textarea
          className="form-control"
          rows={3}
          value={form.notes}
          onChange={(e) => setField('notes', e.target.value)}
          style={{ ...OHGO_INPUT, resize: 'none' }}
        />
      </div>
      <div className="d-flex gap-2">
        <button type="button" className={`btn flex-fill ${OHGO_DISMISS_BTN_CLASS}`} onClick={() => router.back()}>
          취소
        </button>
        <button
          type="button"
          className={`btn flex-fill d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
          onClick={() => void handleSubmit()}
          disabled={saving}
        >
          <IoCheckmarkOutline size={18} />
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </SubPageFrame>
  );
}

export default function AdminFishingLogFormPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <FishingLogFormContent />
    </Suspense>
  );
}
