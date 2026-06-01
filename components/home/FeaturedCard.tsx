'use client';

interface FeaturedCardProps {
  title: string;
  imageUrl?: string;
  badge?: string;
  onClick?: () => void;
}

export default function FeaturedCard({ title, imageUrl, badge, onClick }: FeaturedCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn p-0 border-0 bg-white flex-shrink-0 text-start overflow-hidden"
      style={{
        width: 160,
        borderRadius: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <div className="position-relative">
        <div
          style={{
            width: 160,
            height: 120,
            background: imageUrl
              ? `url(${imageUrl}) center/cover no-repeat`
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          }}
        />
        {badge && (
          <span
            className="position-absolute top-0 start-0 m-2 badge rounded-pill"
            style={{ backgroundColor: '#FF9500', fontSize: '10px' }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="p-2 px-3">
        <div
          className="fw-semibold text-truncate"
          style={{
            fontSize: '14px',
            color: '#1A1D1F',
            fontFamily: 'var(--font-urbanist), sans-serif',
          }}
        >
          {title}
        </div>
      </div>
    </button>
  );
}
