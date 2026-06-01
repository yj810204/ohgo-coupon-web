'use client';

import { IoPersonOutline } from 'react-icons/io5';

interface AvatarHeaderProps {
  userName: string;
  onMyPage?: () => void;
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '오';
  return trimmed.slice(0, 1);
}

export default function AvatarHeader({ userName, onMyPage }: AvatarHeaderProps) {
  return (
    <div className="d-flex align-items-center justify-content-between py-2">
      <div className="d-flex align-items-center gap-3">
        <div
          className="d-flex align-items-center justify-content-center rounded-circle text-white fw-bold"
          style={{
            width: 48,
            height: 48,
            background: 'linear-gradient(135deg, #1B6FF5 0%, #5B8DEF 100%)',
            fontSize: '20px',
            fontFamily: 'var(--font-urbanist), system-ui, sans-serif',
            flexShrink: 0,
          }}
        >
          {getInitials(userName)}
        </div>
        <div>
          <p
            className="mb-0 text-muted"
            style={{ fontSize: '13px', fontFamily: 'var(--font-urbanist), system-ui, sans-serif' }}
          >
            안녕하세요
          </p>
          <h1
            className="mb-0"
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#1A1D1F',
              fontFamily: 'var(--font-urbanist), system-ui, sans-serif',
            }}
          >
            {userName}님! 👋
          </h1>
        </div>
      </div>
      <button
        type="button"
        onClick={onMyPage}
        className="btn btn-light rounded-circle d-flex align-items-center justify-content-center border-0"
        style={{
          width: 44,
          height: 44,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          flexShrink: 0,
        }}
        aria-label="마이페이지"
      >
        <IoPersonOutline size={22} color="#1A1D1F" />
      </button>
    </div>
  );
}
