'use client';

import { useState } from 'react';
import { IoQrCodeOutline, IoPricetagOutline, IoGiftOutline } from 'react-icons/io5';
import { NavSurface } from '@/components/AppLink';

interface StampCouponSummaryProps {
  stampCount: number;
  couponCount: number;
  onStampClick?: () => void;
  onCouponClick?: () => void;
  stampHref?: string;
  couponHref?: string;
  onQrScan: () => void | boolean | Promise<void | boolean>;
}

const FONT = "var(--font-urbanist), system-ui, sans-serif";

const BOX_STYLE: React.CSSProperties = {
  // inline 링크는 배경이 줄마다 잘려 왼쪽 조각으로 보인다.
  display: 'block',
  background: 'rgba(255,255,255,0.18)',
  borderRadius: 12,
  padding: '12px 14px',
  width: '100%',
  boxSizing: 'border-box',
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
  href,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  unit: string;
  onClick?: () => void;
  href?: string;
}) {
  return (
    <NavSurface href={href} onClick={onClick} style={BOX_STYLE}>
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
    </NavSurface>
  );
}

export default function StampCouponSummary({
  stampCount,
  couponCount,
  onStampClick,
  onCouponClick,
  stampHref,
  couponHref,
  onQrScan,
}: StampCouponSummaryProps) {
  const [qrOpening, setQrOpening] = useState(false);

  const handleQrScan = async () => {
    if (qrOpening) return;
    setQrOpening(true);
    try {
      const proceeded = await onQrScan();
      if (proceeded === false) setQrOpening(false);
    } catch {
      setQrOpening(false);
    }
  };

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
            href={stampHref}
            onClick={onStampClick}
          />
        </div>
        <div className="col-6">
          <StatBox
            icon={<IoGiftOutline size={14} />}
            label="쿠폰"
            count={couponCount}
            unit="장"
            href={couponHref}
            onClick={onCouponClick}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleQrScan}
        disabled={qrOpening}
        className="btn btn-light w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold"
        style={{
          borderRadius: 12,
          padding: '12px',
          color: '#1B6FF5',
          fontFamily: FONT,
          border: 'none',
          opacity: qrOpening ? 0.85 : 1,
        }}
      >
        {qrOpening ? (
          <>
            <span
              className="spinner-border spinner-border-sm"
              role="status"
              style={{ width: 18, height: 18, borderWidth: 2, color: '#1B6FF5' }}
            />
            카메라 준비 중…
          </>
        ) : (
          <>
            <IoQrCodeOutline size={20} />
            QR 스캔으로 스탬프 적립
          </>
        )}
      </button>
    </div>
  );
}
