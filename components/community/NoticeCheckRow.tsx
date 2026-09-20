'use client';

import { OHGO_CARD, OHGO_FONT } from '@/lib/page-styles';

type NoticeCheckRowProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

export default function NoticeCheckRow({ checked, onChange, disabled }: NoticeCheckRowProps) {
  return (
    <label
      className="d-flex align-items-center gap-2"
      style={{
        ...OHGO_CARD,
        padding: '12px 16px',
        marginBottom: 12,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        className="form-check-input flex-shrink-0 m-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 20, height: 20, accentColor: '#1B6FF5', cursor: disabled ? 'default' : 'pointer' }}
      />
      <span className="min-w-0">
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: OHGO_FONT }}>
          공지사항
        </span>
        <span style={{ display: 'block', fontSize: 12, color: '#6F767E', fontFamily: OHGO_FONT, marginTop: 2 }}>
          체크하면 게시 목록 맨 위에 고정됩니다.
        </span>
      </span>
    </label>
  );
}
