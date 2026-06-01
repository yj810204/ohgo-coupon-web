'use client';

import { IoQrCodeOutline, IoPricetagOutline, IoGiftOutline } from 'react-icons/io5';

interface StampCouponSummaryProps {
  stampCount: number;
  couponCount: number;
  onStampClick: () => void;
  onCouponClick: () => void;
  onQrScan: () => void;
}

export default function StampCouponSummary({
  stampCount,
  couponCount,
  onStampClick,
  onCouponClick,
  onQrScan,
}: StampCouponSummaryProps) {
  return (
    <div
      className="rounded-4 p-4 text-white position-relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #1B6FF5 0%, #5B8DEF 100%)',
        boxShadow: '0 4px 16px rgba(27, 111, 245, 0.35)',
        borderRadius: '16px',
      }}
    >
      <div className="row g-3 mb-3">
        <div className="col-6">
          <button
            type="button"
            onClick={onStampClick}
            className="btn w-100 text-start text-white border-0 p-0"
            style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '14px' }}
          >
            <div className="d-flex align-items-center gap-2 mb-1 opacity-75" style={{ fontSize: '12px' }}>
              <IoPricetagOutline size={16} />
              <span>스탬프</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-urbanist), sans-serif' }}>
              {stampCount}
              <span style={{ fontSize: '14px', fontWeight: 500, marginLeft: 4 }}>개</span>
            </div>
          </button>
        </div>
        <div className="col-6">
          <button
            type="button"
            onClick={onCouponClick}
            className="btn w-100 text-start text-white border-0"
            style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '14px' }}
          >
            <div className="d-flex align-items-center gap-2 mb-1 opacity-75" style={{ fontSize: '12px' }}>
              <IoGiftOutline size={16} />
              <span>쿠폰</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-urbanist), sans-serif' }}>
              {couponCount}
              <span style={{ fontSize: '14px', fontWeight: 500, marginLeft: 4 }}>장</span>
            </div>
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onQrScan}
        className="btn btn-light w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold"
        style={{
          borderRadius: '12px',
          padding: '12px',
          color: '#1B6FF5',
          fontFamily: 'var(--font-urbanist), sans-serif',
        }}
      >
        <IoQrCodeOutline size={22} />
        QR 스캔으로 스탬프 적립
      </button>
    </div>
  );
}
