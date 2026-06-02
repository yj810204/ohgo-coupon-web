'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getStamps, getCouponCount, issue50PercentCoupon, deleteStamp } from '@/utils/stamp-service';
import { getUser } from '@/lib/storage';
import { IoQrCodeOutline, IoPricetagOutline, IoGiftOutline, IoCheckmarkCircleOutline, IoStarOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton, OhgoModalField } from '@/components/OhgoModal';
import EmptyState from '@/components/EmptyState';

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
  fontFamily: "'Urbanist', var(--font-urbanist), sans-serif",
};

function StampCard({ raw, isFifth, fromAdmin, onTap }: {
  raw: string;
  isFifth: boolean;
  fromAdmin: boolean;
  onTap: (raw: string, isFifth: boolean) => void;
}) {
  const [date, method, time] = raw.split('|');
  const methodLabel = method === 'ADMIN' ? '선장님' : method === 'QR' ? 'QR 스캔' : '알 수 없음';

  return (
    <button
      type="button"
      onClick={() => onTap(raw, isFifth)}
      className="btn w-100 text-start p-3"
      style={{
        ...CARD_STYLE,
        ...(isFifth ? { backgroundColor: '#EBF1FE', border: '1.5px solid #C7D9FD' } : {}),
        transition: 'transform 0.15s',
      }}
    >
      <div className="d-flex align-items-center gap-3">
        <div
          className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
          style={{ width: 40, height: 40, backgroundColor: isFifth ? '#EBF1FE' : '#F7F8FA' }}
        >
          <IoPricetagOutline size={20} color={isFifth ? '#1B6FF5' : '#6F767E'} />
        </div>
        <div className="flex-grow-1">
          <div style={{ fontSize: 15, fontWeight: 600, color: isFifth ? '#1B6FF5' : '#1A1D1F' }}>
            {date.replace(/-/g, '.')}
            {time && ` ${time.slice(0, 5)}`}
          </div>
          <div style={{ fontSize: 13, color: '#6F767E', marginTop: 2 }}>
            {isFifth && !fromAdmin
              ? <><IoStarOutline size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />50% 쿠폰 발급 가능 — 탭해서 발급받기</>
              : `적립 방법: ${methodLabel}`}
          </div>
        </div>
        {isFifth && !fromAdmin && (
          <span className="badge rounded-pill" style={{ backgroundColor: '#1B6FF5', fontSize: 11 }}>발급</span>
        )}
      </div>
    </button>
  );
}

function StampPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stamps, setStamps] = useState<string[]>([]);
  const [couponCount, setCouponCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStampInfo, setSelectedStampInfo] = useState<{ date: string; method?: string; value?: string } | null>(null);
  const [user, setUser] = useState<{ uuid?: string; name?: string; dob?: string } | null>(null);
  const fromAdmin = searchParams.get('fromAdmin') === 'true';
  const targetUuid = searchParams.get('uuid');
  const targetName = searchParams.get('name');
  const targetDob = searchParams.get('dob');

  useEffect(() => {
    const loadUser = async () => {
      if (fromAdmin && targetUuid && targetName && targetDob) {
        setUser({ uuid: targetUuid, name: targetName, dob: targetDob });
      } else {
        const u = await getUser();
        if (!u?.uuid) { router.replace('/login'); return; }
        setUser(u);
      }
    };
    loadUser();
  }, [router, fromAdmin, targetUuid, targetName, targetDob]);

  const fetchStamps = useCallback(async () => {
    if (!user?.uuid) return;
    try {
      const data = await getStamps(user.uuid);
      const sorted = [...data].sort((a, b) => {
        const [dA,, tA] = a.split('|');
        const [dB,, tB] = b.split('|');
        try {
          return new Date(`20${dB}T${tB||'00:00:00'}`).getTime() - new Date(`20${dA}T${tA||'00:00:00'}`).getTime();
        } catch { return 0; }
      });
      setStamps(sorted);
      const coupons = await getCouponCount(user.uuid);
      setCouponCount(coupons);
    } catch (err) { console.error(err); }
  }, [user?.uuid]);

  useEffect(() => { if (user?.uuid) fetchStamps(); }, [user?.uuid, fetchStamps]);

  const handleTap = (raw: string, isFifth: boolean) => {
    if (isFifth && !fromAdmin) {
      if (!confirm('50% 할인 쿠폰을 발급하시겠습니까?')) return;
      issue50PercentCoupon(user!.uuid!).then(() => {
        alert('50% 쿠폰이 발급되었습니다!');
        fetchStamps();
      }).catch(err => alert('오류: ' + err.message));
    } else {
      const [date, method, time] = raw.split('|');
      const methodLabel = method === 'ADMIN' ? '선장님' : method === 'QR' ? 'QR 스캔' : '알 수 없음';
      setSelectedStampInfo({ date: `${date} ${time}`, method: methodLabel, value: raw });
      setModalVisible(true);
    }
  };

  if (!user) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  const fifthStampRaw = stamps.length >= 5 ? stamps[stamps.length - 5] : null;
  const query = `uuid=${user.uuid}&name=${encodeURIComponent(user.name||'')}&dob=${user.dob||''}`;

  return (
    <SubPageFrame title="스탬프" onRefresh={fetchStamps}>
        {/* 요약 카드 */}
        <div className="p-4 mb-4" style={{ ...CARD_STYLE }}>
          <div className="d-flex align-items-center gap-3 mb-3">
            <div className="rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: 48, height: 48, background: 'linear-gradient(135deg,#1B6FF5,#5B8DEF)', flexShrink: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{stamps.length}</span>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#6F767E', fontFamily: "'Urbanist',sans-serif" }}>현재 스탬프</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1A1D1F', fontFamily: "'Urbanist',sans-serif" }}>
                {stamps.length}개 보유
              </div>
            </div>
            <div className="ms-auto text-end">
              <div style={{ fontSize: 13, color: '#6F767E', fontFamily: "'Urbanist',sans-serif" }}>보유 쿠폰</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1B6FF5', fontFamily: "'Urbanist',sans-serif" }}>
                {couponCount}장
              </div>
            </div>
          </div>
          <div className="d-flex gap-2">
            {!fromAdmin && (
              <button
                type="button"
                onClick={() => router.push(`/qr-scan?${query}`)}
                className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-2 fw-semibold"
                style={{ backgroundColor: '#1B6FF5', color: '#fff', borderRadius: 12, padding: '11px', border: 'none', fontFamily: "'Urbanist',sans-serif" }}
              >
                <IoQrCodeOutline size={20} />
                QR 스캔
              </button>
            )}
            {!fromAdmin && (
              <button
                type="button"
                onClick={() => router.push(`/coupons?${query}`)}
                className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-2 fw-semibold"
                style={{ backgroundColor: '#EBF1FE', color: '#1B6FF5', borderRadius: 12, padding: '11px', border: 'none', fontFamily: "'Urbanist',sans-serif" }}
              >
                <IoGiftOutline size={20} />
                쿠폰 보기
              </button>
            )}
          </div>
        </div>

        {/* 적립 내역 */}
        <div className="d-flex align-items-center justify-content-between mb-2 px-1">
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F', fontFamily: "'Urbanist',sans-serif" }}>
            적립 내역
          </span>
          {fromAdmin && (
            <span className="badge rounded-pill" style={{ backgroundColor: '#FF9500', fontSize: 11 }}>관리자 모드</span>
          )}
        </div>

        {/* 스탬프 목록 */}
        {stamps.length === 0 ? (
          <EmptyState icon={IoPricetagOutline} message="스탬프가 아직 없어요!" style={CARD_STYLE} />
        ) : (
          <div className="d-flex flex-column gap-2">
            {stamps.map((raw, idx) => (
              <StampCard
                key={idx}
                raw={raw}
                isFifth={raw === fifthStampRaw}
                fromAdmin={fromAdmin}
                onTap={handleTap}
              />
            ))}
          </div>
        )}

      <OhgoModal
        open={modalVisible && !!selectedStampInfo}
        onClose={() => setModalVisible(false)}
        title="스탬프 정보"
        footer={
          fromAdmin && selectedStampInfo?.value ? (
            <OhgoModalButton
              variant="danger"
              onClick={async () => {
                await deleteStamp(user!.uuid!, selectedStampInfo.value!, user!.name!, user!.dob!);
                await fetchStamps();
                setModalVisible(false);
              }}
            >
              스탬프 회수
            </OhgoModalButton>
          ) : undefined
        }
      >
        {selectedStampInfo && (
          <>
            <OhgoModalField label="적립일" value={selectedStampInfo.date} />
            <OhgoModalField label="적립 방법" value={selectedStampInfo.method} />
          </>
        )}
      </OhgoModal>
    </SubPageFrame>
  );
}

export default function StampPage() {
  return (
    <Suspense fallback={<div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}><div className="spinner-border text-primary" role="status" /></div>}>
      <StampPageContent />
    </Suspense>
  );
}
