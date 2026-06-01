'use client';

interface GridCardProps {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  onClick?: () => void;
}

export default function GridCard({ title, subtitle, imageUrl, onClick }: GridCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn w-100 p-0 text-start border-0 bg-white overflow-hidden"
      style={{
        borderRadius: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <div
        className="w-100 bg-light d-flex align-items-center justify-content-center"
        style={{
          aspectRatio: '4/3',
          background: imageUrl
            ? `url(${imageUrl}) center/cover no-repeat`
            : 'linear-gradient(135deg, #e8f0fe 0%, #f0f4f8 100%)',
        }}
      >
        {!imageUrl && (
          <span className="text-muted" style={{ fontSize: '12px' }}>
            조황 사진
          </span>
        )}
      </div>
      <div className="p-3">
        <div
          className="fw-semibold text-truncate mb-1"
          style={{
            fontSize: '14px',
            color: '#1A1D1F',
            fontFamily: 'var(--font-urbanist), sans-serif',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-muted text-truncate" style={{ fontSize: '12px' }}>
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
}
