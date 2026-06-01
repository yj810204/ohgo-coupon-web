'use client';

import { IoQrCodeOutline, IoPricetagOutline, IoGiftOutline } from 'react-icons/io5';

interface StampCouponSummaryProps {
  stampCount: number;
  couponCount: number;
  onStampClick: () => void;
  onCouponClick: () => void;
  onQrScan: () => void;
}

const FONT = "var(--font-urbanist), system-ui, sans-serif";

const BOX_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.18)',
  borderRadius: 12,
  padding: '12px 14px',
  width: '100%',
  border: 'none',
  textAlign: 'left',
  color: '#fff',
};

function StatBox({
  icon,
  label,
  count,
  unit,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  unit: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={BOX_STYLE}>
      <div
        className="d-flex align-items-center gap-1"
        style={{ fontSize: 12, opacity: 0.9, marginBottom: 8, fontFamily: FONT }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div className="d-flex align-items-baseline gap-1" style={{ fontFamily: FONT, lineHeight: 1 }}>
        <span style={{ fontSize: 26, fontWeight: 700 }}>{count}</span>
        <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.95 }}>{unit}</span>
      </div>
    </button>
  );
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
      className="text-white"
      style={{
        background: 'linear-gradient(135deg, #1B6FF5 0%, #5B8DEF 100%)',
        boxShadow: '0 4px 16px rgba(27, 111, 245, 0.35)',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div className="row g-2 mb-3">
        <div className="col-6">
          <StatBox
            icon={<IoPricetagOutline size={14} />}
            label="스탬프"
            count={stampCount}
            unit="개"
            onClick={onStampClick}
          />
        </div>
        <div className="col-6">
          <StatBox
            icon={<IoGiftOutline size={14} />}
            label="쿠폰"
            count={couponCount}
            unit="장"
            onClick={onCouponClick}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onQrScan}
        className="btn btn-light w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold"
        style={{
          borderRadius: 12,
          padding: '12px',
          color: '#1B6FF5',
          fontFamily: FONT,
          border: 'none',
        }}
      >
        <IoQrCodeOutline size={20} />
        QR 스캔으로 스탬프 적립
      </button>
    </div>
  );
}
