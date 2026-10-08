'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { IoPricetagOutline, IoStarOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import StampProgressCard from '@/components/stamp/StampProgressCard';
import { SAMPLE_STAMPS } from '@/lib/samples/mock-data';

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
  fontFamily: "var(--font-ohgo), sans-serif",
};

function StampCard({
  raw,
  isFifth,
}: {
  raw: string;
  isFifth: boolean;
}) {
  const [date, method, time] = raw.split('|');
  const methodLabel = method === 'ADMIN' ? '선장님' : method === 'QR' ? 'QR 스캔' : '알 수 없음';

  return (
    <div
      className="w-100 text-start px-3"
      style={{
        ...CARD_STYLE,
        boxSizing: 'border-box',
        height: 76,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: isFifth ? '#EBF1FE' : '#FFFFFF',
        border: isFifth ? '1.5px solid #C7D9FD' : '1.5px solid transparent',
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
            {isFifth && (
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
              {isFifth ? '50% 쿠폰 발급 가능 — 탭해서 발급받기' : `적립 방법: ${methodLabel}`}
            </span>
          </div>
        </div>
        <span
          className="badge rounded-pill flex-shrink-0"
          style={{
            backgroundColor: '#1B6FF5',
            fontSize: 11,
            lineHeight: '16px',
            visibility: isFifth ? 'visible' : 'hidden',
          }}
        >
          발급
        </span>
      </div>
    </div>
  );
}

function SampleStampPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stamps = searchParams.get('empty') === '1' ? [] : SAMPLE_STAMPS;
  const fifthStampRaw = stamps.length >= 5 ? stamps[stamps.length - 5] : null;

  return (
    <SubPageFrame
      title="스탬프"
      showMyPage={false}
      onBack={() => router.push('/samples/main')}
    >
      <StampProgressCard
        count={stamps.length}
        onQrScan={() => router.push('/samples/qr-scan')}
        onCoupons={() => router.push('/samples/coupons')}
      />

      <div className="d-flex align-items-center justify-content-between mb-2 px-1">
        <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F' }}>적립 내역</span>
      </div>

      <div className="d-flex flex-column gap-2">
        {stamps.map((raw) => (
          <StampCard key={raw} raw={raw} isFifth={raw === fifthStampRaw} />
        ))}
      </div>
    </SubPageFrame>
  );
}

export default function SampleStampPage() {
  return (
    <Suspense
      fallback={
        <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
          <div className="spinner-border text-primary" role="status" />
        </div>
      }
    >
      <SampleStampPageContent />
    </Suspense>
  );
}
