'use client';

import { formatHolidayDateLine, holidayDateTextColor } from '@/lib/holiday-date-label';

export default function HolidayDateLine({
  date,
  holidayName,
  fontSize,
  plainColor,
  fontFamily,
  marginTop = 0,
}: {
  date: string;
  holidayName?: string | null;
  fontSize: number;
  plainColor: string;
  fontFamily: string;
  marginTop?: number;
}) {
  const official = holidayName?.trim() ?? '';
  const label = formatHolidayDateLine(date, official);
  return (
    <div
      title={official || undefined}
      style={{
        fontSize,
        fontWeight: 600,
        color: holidayDateTextColor(date, official, plainColor),
        fontFamily,
        marginTop,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </div>
  );
}
