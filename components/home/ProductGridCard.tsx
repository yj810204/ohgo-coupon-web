'use client';

import type { ClosedMallProduct } from '@/constants/closed-mall';

interface ProductGridCardProps {
  product: ClosedMallProduct;
  onClick?: () => void;
}

export default function ProductGridCard({ product, onClick }: ProductGridCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn w-100 p-0 border-0 bg-white text-start overflow-hidden"
      style={{
        borderRadius: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <div
        className="w-100 d-flex align-items-center justify-content-center"
        style={{
          aspectRatio: '1',
          background: 'linear-gradient(135deg, #f0f4ff 0%, #e8ecf4 100%)',
        }}
      >
        <span style={{ fontSize: '32px' }}>🎣</span>
      </div>
      <div className="p-3">
        {product.memberOnly && (
          <span
            className="badge rounded-pill mb-2"
            style={{ backgroundColor: '#1B6FF5', fontSize: '10px', fontWeight: 600 }}
          >
            멤버 전용
          </span>
        )}
        <div
          className="fw-semibold text-truncate mb-1"
          style={{
            fontSize: '14px',
            color: '#1A1D1F',
            fontFamily: 'var(--font-urbanist), sans-serif',
          }}
        >
          {product.name}
        </div>
        <div style={{ fontSize: '13px', color: '#1B6FF5', fontWeight: 600 }}>{product.price}</div>
      </div>
    </button>
  );
}
