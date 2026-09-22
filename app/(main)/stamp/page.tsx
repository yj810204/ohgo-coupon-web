'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { getStamps, issue50PercentCoupon, deleteStamp } from '@/utils/stamp-service';
import { getUser } from '@/lib/storage';
import { IoQrCodeOutline, IoPricetagOutline, IoGiftOutline, IoStarOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton, OhgoModalField } from '@/components/OhgoModal';
import EmptyState from '@/components/EmptyState';
import { OHGO_FONT } from '@/lib/page-styles';
import { useNavigation } from '@/hooks/useNavigation';
import { ohgoConfirm } from '@/lib/ohgo-dialog';
import { confirmBoardingForStampScan } from '@/lib/stamps/confirm-boarding-for-scan';

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
  fontFamily: OHGO_FONT,
};

function StampCard({ raw, isFifth, fromAdmin, onTap }: {
  raw: string;
  isFifth: boolean;
  fromAdmin: boolean;
  onTap: (raw: string, isFifth: boolean) => void;
}) {
  const [date, method, time] = raw.split('|');
  const methodLabel = method === 'ADMIN' ? '선장님' : method === 'QR' ? 'QR 스캔' : '알 수 없음';

  const showIssue = isFifth && !fromAdmin;

  return (
    <button
      type="button"
      onClick={() => onTap(raw, isFifth)}
      className="btn w-100 text-start px-3"
      style={{
        ...CARD_STYLE,
        boxSizing: 'border-box',
        height: 76,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: isFifth ? '#EBF1FE' : '#FFFFFF',
        border: isFifth ? '1.5px solid #C7D9FD' : '1.5px solid transparent',
        transition: 'transform 0.15s',
      }}
    >
      <div className="d-flex align-items-center gap-3 w-100" style={{ minWidth: 0 }}>
        <div
          className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
          style={{
            width: 40,
            height: 40,
            backgroundColor: isFifth ? '#D6E4FF' : '#F7F8FA',
          }}
        >
          <IoPricetagOutline size={20} color={isFifth ? '#1B6FF5' : '#6F767E'} />
        </div>
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div
            className="text-truncate"
            style={{
              fontSize: 15,
              fontWeight: 600,
              lineHeight: '20px',
              color: isFifth ? '#1B6FF5' : '#1A1D1F',
            }}
          >
            {date.replace(/-/g, '.')}
            {time && ` ${time.slice(0, 5)}`}
          </div>
          <div
            className="d-flex align-items-center"
            style={{ marginTop: 2, minWidth: 0, height: 18 }}
          >
            {showIssue && (
              <IoStarOutline
                size={13}
                color="#6F767E"
                className="flex-shrink-0"
                style={{ marginRight: 4, display: 'block' }}
              />
            )}
            <span
              className="text-truncate"
              style={{ fontSize: 13, lineHeight: '18px', color: '#6F767E', minWidth: 0 }}
            >
              {showIssue ? '50% 쿠폰 발급 가능 — 탭해서 발급받기' : `적립 방법: ${methodLabel}`}
            </span>
          </div>
        </div>
        <span
          className="badge rounded-pill flex-shrink-0"
          style={{
            backgroundColor: '#1B6FF5',
            fontSize: 11,
            lineHeight: '16px',
            visibility: showIssue ? 'visible' : 'hidden',
          }}
        >
          발급
        </span>
      </div>
    </button>
  );
}

function StampPageContent() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const searchParams = useSearchParams();
  const [stamps, setStamps] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStampInfo, setSelectedStampInfo] = useState<{ date: string; method?: string; value?: string } | null>(null);
  const [user, setUser] = useState<{ uuid?: string; name?: string; dob?: string } | null>(null);
  const [qrOpening, setQrOpening] = useState(false);
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
    } catch (err) { console.error(err); }
  }, [user?.uuid]);

  useEffect(() => { if (user?.uuid) fetchStamps(); }, [user?.uuid, fetchStamps]);

  const handleTap = async (raw: string, isFifth: boolean) => {
    if (isFifth && !fromAdmin) {
      if (!(await ohgoConfirm('50% 할인 쿠폰을 발급하시겠습니까?'))) return;
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
        <div className="ohgo-status-card mb-4" style={{ ...CARD_STYLE }}>
          <div className="d-flex align-items-center gap-3 w-100">
            <div
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: 48, height: 48, backgroundColor: '#EBF1FE' }}
            >
              <IoPricetagOutline size={22} color="#1B6FF5" />
            </div>
            <div className="flex-grow-1 min-w-0">
              <div
                className="text-truncate"
                style={{ fontSize: 17, fontWeight: 800, color: '#1A1D1F', fontFamily: OHGO_FONT, lineHeight: 1.25 }}
              >
                {user.name}
              </div>
              <div
                className="d-flex align-items-center"
                style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT, lineHeight: 1.4, marginTop: 4 }}
              >
                <span className="text-truncate">
                  {user.dob?.length === 8
                    ? `${user.dob.slice(0, 4)}.${user.dob.slice(4, 6)}.${user.dob.slice(6)}`
                    : user.dob}
                </span>
                {fromAdmin && (
                  <span className="ms-2 badge rounded-pill flex-shrink-0" style={{ backgroundColor: '#FF9500', fontSize: 10 }}>
                    관리자 모드
                  </span>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 text-end">
              <div style={{ fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT, lineHeight: 1.2 }}>보유</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1B6FF5', fontFamily: OHGO_FONT, lineHeight: 1.2 }}>
                {stamps.length}개
              </div>
            </div>
          </div>
        </div>

        {!fromAdmin && (
          <div className="d-flex gap-2 mb-4">
            <button
              type="button"
              disabled={qrOpening}
              onClick={async () => {
                if (qrOpening) return;
                setQrOpening(true);
                const gate = await confirmBoardingForStampScan(user.uuid!);
                if (gate !== 'ok') {
                  setQrOpening(false);
                  if (gate === 'go_form') navigate('/boarding-form');
                  return;
                }
                navigate(`/qr-scan?${query}`);
              }}
              className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-2 fw-semibold"
              style={{
                backgroundColor: '#1B6FF5',
                color: '#fff',
                borderRadius: 12,
                padding: '11px',
                border: 'none',
                fontFamily: OHGO_FONT,
                opacity: qrOpening ? 0.85 : 1,
              }}
            >
              {qrOpening ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    style={{ width: 18, height: 18, borderWidth: 2 }}
                  />
                  준비 중…
                </>
              ) : (
                <>
                  <IoQrCodeOutline size={20} />
                  QR 스캔
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/coupons?${query}`)}
              className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-2 fw-semibold"
              style={{
                backgroundColor: '#EBF1FE',
                color: '#1B6FF5',
                borderRadius: 12,
                padding: '11px',
                border: 'none',
                fontFamily: OHGO_FONT,
              }}
            >
              <IoGiftOutline size={20} />
              쿠폰 보기
            </button>
          </div>
        )}

        <div className="d-flex align-items-center justify-content-between mb-2 px-1">
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT }}>
            적립 내역
          </span>
          <span className="badge rounded-pill" style={{ backgroundColor: '#1B6FF5', fontSize: 12 }}>
            {stamps.length}개
          </span>
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
