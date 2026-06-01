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
            : '#F2F3F5',
        }}
      >
        {!imageUrl && (
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 512 512" fill="none">
            <path d="M368 224c26.5 0 48-21.5 48-48s-21.5-48-48-48-48 21.5-48 48 21.5 48 48 48z" fill="#C8CDD4"/>
            <path d="M452 64H60C42.3 64 28 78.3 28 96v320c0 17.7 14.3 32 32 32h392c17.7 0 32-14.3 32-32V96c0-17.7-14.3-32-32-32zm-6 339L310 216 210 364l-60-75L68 416V102h378v301z" fill="#C8CDD4"/>
          </svg>
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
