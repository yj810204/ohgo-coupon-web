'use client';

import { useRouter } from '@/hooks/useAppRouter';
import { IoGiftOutline, IoCheckmarkCircleOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import { SAMPLE_COUPONS, SAMPLE_USER } from '@/lib/samples/mock-data';

const FONT = "var(--font-ohgo), sans-serif";
const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
};

export default function SampleCouponsPage() {
  const router = useRouter();
  const usable = SAMPLE_COUPONS.filter((c) => !c.used);
  const used = SAMPLE_COUPONS.filter((c) => c.used);
  const dob = SAMPLE_USER.dob;

  return (
    <SubPageFrame
      title="쿠폰"
      showMyPage={false}
      onBack={() => router.push('/samples/main')}
    >
      <div className="mb-4 p-3" style={{ ...CARD }}>
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
            style={{ width: 44, height: 44, backgroundColor: '#EBF1FE' }}
          >
            <IoGiftOutline size={22} color="#1B6FF5" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
              {SAMPLE_USER.name}
            </div>
            <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
              {dob.length === 6
                ? `19${dob.slice(0, 2)}.${dob.slice(2, 4)}.${dob.slice(4)}`
                : dob}
            </div>
          </div>
          <div className="ms-auto text-end">
            <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT }}>사용 가능</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1B6FF5', fontFamily: FONT }}>
              {usable.length}장
            </div>
          </div>
        </div>
      </div>

      <div className="d-flex align-items-center justify-content-between mb-2 px-1">
        <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
          사용 가능한 쿠폰
        </span>
        <span className="badge rounded-pill" style={{ backgroundColor: '#1B6FF5', fontSize: 12 }}>
          {usable.length}개
        </span>
      </div>

      <div className="d-flex flex-column gap-2 mb-4">
        {usable.map((coupon) => (
          <div key={coupon.id} className="p-3" style={CARD}>
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 40, height: 40, backgroundColor: '#EBF1FE' }}
              >
                <IoGiftOutline size={20} color="#1B6FF5" />
              </div>
              <div className="flex-grow-1">
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D1F', fontFamily: FONT }}>
                  {coupon.reason}
                </div>
                <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>
                  발급일: {coupon.issuedAt}
                </div>
              </div>
              {coupon.isHalf === 'Y' && (
                <span
                  className="badge rounded-pill"
                  style={{ backgroundColor: '#FF9500', fontSize: 11, flexShrink: 0 }}
                >
                  50%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {used.length > 0 && (
        <>
          <div className="d-flex align-items-center justify-content-between mb-2 px-1">
            <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
              사용된 쿠폰
            </span>
            <span className="badge rounded-pill" style={{ backgroundColor: '#6F767E', fontSize: 12 }}>
              {used.length}개
            </span>
          </div>
          <div className="d-flex flex-column gap-2">
            {used.map((coupon) => (
              <div key={coupon.id} className="p-3" style={{ ...CARD, opacity: 0.5 }}>
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: 40, height: 40, backgroundColor: '#F7F8FA' }}
                  >
                    <IoCheckmarkCircleOutline size={20} color="#6F767E" />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#6F767E',
                        textDecoration: 'line-through',
                        fontFamily: FONT,
                      }}
                    >
                      {coupon.reason}
                    </div>
                    <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>
                      발급일: {coupon.issuedAt} (사용됨)
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SubPageFrame>
  );
}
