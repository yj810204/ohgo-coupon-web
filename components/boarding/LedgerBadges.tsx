'use client';

import { isCounted, sourceLabel, type LedgerEntry, type LedgerSource } from '@/lib/boarding-ledger.shared';
import { OHGO_FONT } from '@/lib/page-styles';

const SOURCE_ORDER: LedgerSource[] = ['ROSTER_IMAGE', 'CONFIRM', 'TRIP_CREDITED', 'STAMP', 'ADMIN'];

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: bg,
        fontFamily: OHGO_FONT,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export function LedgerSourceChips({ sources }: { sources: LedgerSource[] }) {
  const sorted = SOURCE_ORDER.filter((s) => sources.includes(s));
  return (
    <span className="d-inline-flex flex-wrap gap-1">
      {sorted.map((s) => (
        <Chip key={s} label={sourceLabel(s)} color="#4A5059" bg="#F1F3F5" />
      ))}
    </span>
  );
}

export function LedgerStatusChip({ entry }: { entry: LedgerEntry }) {
  if (entry.status === 'void') return <Chip label="제외됨" color="#6F767E" bg="#E6E8EC" />;
  if (!isCounted(entry)) return <Chip label="스탬프만 있음 · 미반영" color="#B25E00" bg="#FFF4E5" />;
  if (entry.status === 'unmatched') return <Chip label="회원 미연결" color="#B25E00" bg="#FFF4E5" />;
  if (entry.needsReview) return <Chip label="확인 필요" color="#B25E00" bg="#FFF4E5" />;
  if (entry.role === 'crew') return <Chip label="선원" color="#1B6FF5" bg="#EEF4FF" />;
  return null;
}
