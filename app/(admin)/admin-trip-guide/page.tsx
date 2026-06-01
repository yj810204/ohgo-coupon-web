'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import {
  TripGuide,
  TripGuideInput,
  getAllTrips,
  addTrip,
  updateTrip,
  deleteTrip,
} from '@/utils/trip-guide-service';
import {
  IoAddOutline,
  IoTrashOutline,
  IoPencilOutline,
  IoBoatOutline,
  IoCloseOutline,
  IoCheckmarkOutline,
} from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";
const CARD: React.CSSProperties = { backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: 'none' };

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

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

export default function AdminTripGuidePage() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<TripGuideInput>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const user = await getUser();
      if (!user?.uuid) { router.replace('/login'); return; }
      const remote = await getUserByUUID(user.uuid);
      if (!remote?.isAdmin) { router.replace('/main'); return; }
      loadTrips();
    };
    checkAdmin();
  }, [router]);

  const loadTrips = async () => {
    setLoading(true);
    try {
      const data = await getAllTrips();
      setTrips(data);
    } finally { setLoading(false); }
  };

  const openNew = () => {
    setForm({ ...EMPTY, date: new Date().toISOString().split('T')[0] });
    setEditId(null);
    setShowForm(true);
  };

  const openEdit = (t: TripGuide) => {
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
    setEditId(t.id);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY); };

  const handleSave = async () => {
    if (!form.date || !form.destination || !form.departureTime) {
      alert('날짜, 목적지, 출발 시간은 필수입니다.');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateTrip(editId, form);
      } else {
        await addTrip(form);
      }
      await loadTrips();
      closeForm();
    } catch (e) {
      alert('저장 중 오류가 발생했습니다.');
      console.error(e);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, dest: string) => {
    if (!confirm(`"${dest}" 출조 일정을 삭제하시겠습니까?`)) return;
    try {
      await deleteTrip(id);
      await loadTrips();
    } catch (e) {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const setField = <K extends keyof TripGuideInput>(key: K, value: TripGuideInput[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const dayLabel = (dateStr: string) => {
    try {
      return DAYS[new Date(dateStr + 'T00:00:00').getDay()];
    } catch { return ''; }
  };

  return (
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <PageHeader title="출조 일정 관리" />
      <div className="container py-3" style={{ maxWidth: 480 }}>

        {/* 추가 버튼 */}
        <button
          type="button"
          onClick={openNew}
          className="btn w-100 d-flex align-items-center justify-content-center gap-2 fw-bold mb-4"
          style={{ backgroundColor: '#1B6FF5', color: '#fff', borderRadius: 14, padding: '13px', border: 'none', fontFamily: FONT, fontSize: 15, boxShadow: '0 4px 12px rgba(27,111,245,0.3)' }}
        >
          <IoAddOutline size={20} />
          새 출조 일정 추가
        </button>

        {/* 목록 */}
        {loading ? (
          <div className="py-5 text-center"><div className="spinner-border text-primary" /></div>
        ) : trips.length === 0 ? (
          <div className="py-5 text-center" style={CARD}>
            <IoBoatOutline size={52} color="#EFEFEF" />
            <p className="mt-3 mb-0" style={{ color: '#6F767E', fontFamily: FONT }}>등록된 출조 일정이 없습니다.</p>
          </div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {trips.map(trip => (
              <div key={trip.id} className="p-3" style={{ ...CARD, borderLeft: '4px solid #1B6FF5' }}>
                <div className="d-flex align-items-start gap-3">
                  <div className="text-center flex-shrink-0" style={{ width: 44 }}>
                    <div style={{ fontSize: 11, color: '#6F767E', fontFamily: FONT }}>{dayLabel(trip.date)}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT }}>{parseInt(trip.date.split('-')[2])}</div>
                    <div style={{ fontSize: 11, color: '#ABABAB', fontFamily: FONT }}>{trip.date.slice(0, 7)}</div>
                  </div>
                  <div style={{ width: 1, height: 44, backgroundColor: '#EFEFEF', flexShrink: 0 }} />
                  <div className="flex-grow-1">
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{trip.destination}</div>
                    <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>
                      {trip.departureTime} 출발
                      {trip.returnTime && ` ~ ${trip.returnTime} 귀항`}
                      {trip.species && ` · ${trip.species}`}
                    </div>
                    {trip.price && (
                      <div style={{ fontSize: 12, color: '#1B6FF5', fontFamily: FONT, fontWeight: 600, marginTop: 2 }}>
                        {trip.price.toLocaleString()}원
                      </div>
                    )}
                  </div>
                  <div className="d-flex flex-column gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(trip)}
                      className="btn p-1 d-flex align-items-center justify-content-center rounded-circle"
                      style={{ width: 32, height: 32, backgroundColor: '#EBF1FE', border: 'none' }}
                    >
                      <IoPencilOutline size={15} color="#1B6FF5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(trip.id, trip.destination)}
                      className="btn p-1 d-flex align-items-center justify-content-center rounded-circle"
                      style={{ width: 32, height: 32, backgroundColor: '#FFF0F0', border: 'none' }}
                    >
                      <IoTrashOutline size={15} color="#FF3B30" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 등록/수정 모달 */}
      {showForm && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content border-0" style={{ borderRadius: 20, overflow: 'hidden' }}>
              <div className="modal-header border-0 px-4 pt-4 pb-2 d-flex align-items-center">
                <h5 className="modal-title fw-bold mb-0" style={{ color: '#1A1D1F', fontFamily: FONT }}>
                  {editId ? '출조 일정 수정' : '새 출조 일정'}
                </h5>
                <button type="button" onClick={closeForm}
                  className="btn ms-auto p-1 rounded-circle d-flex align-items-center justify-content-center"
                  style={{ border: 'none', backgroundColor: '#F7F8FA', width: 32, height: 32 }}>
                  <IoCloseOutline size={20} color="#6F767E" />
                </button>
              </div>

              <div className="modal-body px-4">
                {[
                  { label: '날짜 *', key: 'date', type: 'date' },
                  { label: '목적지 / 낚시터 *', key: 'destination', type: 'text', placeholder: '예: 서해 외섬' },
                  { label: '출발 시간 *', key: 'departureTime', type: 'time' },
                  { label: '귀항 예정', key: 'returnTime', type: 'time' },
                  { label: '목표 어종', key: 'species', type: 'text', placeholder: '예: 참돔, 광어' },
                  { label: '정원', key: 'capacity', type: 'number', placeholder: '명' },
                  { label: '1인 요금 (원)', key: 'price', type: 'number', placeholder: '0' },
                  { label: '예약 문의 (연락처)', key: 'contact', type: 'text', placeholder: '010-0000-0000' },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key} className="mb-3">
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: FONT, marginBottom: 6, display: 'block' }}>{label}</label>
                    <input
                      type={type}
                      value={(form[key as keyof TripGuideInput] as string | number | undefined) ?? ''}
                      onChange={e => {
                        const v = type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value;
                        setField(key as keyof TripGuideInput, v as any);
                      }}
                      placeholder={placeholder}
                      className="form-control"
                      style={{ borderRadius: 10, border: '2px solid #EFEFEF', padding: '10px 12px', fontFamily: FONT, fontSize: 14, color: '#1A1D1F' }}
                    />
                  </div>
                ))}

                <div className="mb-3">
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: FONT, marginBottom: 6, display: 'block' }}>비고 / 상세내용</label>
                  <textarea
                    value={form.notes || ''}
                    onChange={e => setField('notes', e.target.value)}
                    placeholder="집결 장소, 준비물, 주의사항 등"
                    rows={4}
                    className="form-control"
                    style={{ borderRadius: 10, border: '2px solid #EFEFEF', padding: '10px 12px', fontFamily: FONT, fontSize: 14, color: '#1A1D1F', resize: 'none' }}
                  />
                </div>
              </div>

              <div className="modal-footer border-0 px-4 pb-4 pt-2 d-flex gap-2">
                <button type="button" onClick={closeForm} className="btn flex-grow-1 fw-semibold"
                  style={{ backgroundColor: '#F7F8FA', color: '#1A1D1F', borderRadius: 12, padding: 13, border: 'none', fontFamily: FONT }}>
                  취소
                </button>
                <button type="button" onClick={handleSave} disabled={saving} className="btn flex-grow-1 fw-semibold d-flex align-items-center justify-content-center gap-2"
                  style={{ backgroundColor: '#1B6FF5', color: '#fff', borderRadius: 12, padding: 13, border: 'none', fontFamily: FONT }}>
                  {saving ? <span className="spinner-border spinner-border-sm" /> : <IoCheckmarkOutline size={18} />}
                  {editId ? '수정' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
