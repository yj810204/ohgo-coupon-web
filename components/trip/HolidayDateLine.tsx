'use client';

import { holidayDateParts, holidayDateTextColor } from '@/lib/holiday-date-label';
import { HOLIDAY_RED } from '@/lib/kr-holidays';

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
  const { dateLine, holidayLine } = holidayDateParts(date, official);
  const lineStyle = {
    fontWeight: 600,
    fontFamily,
    lineHeight: 1.3,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
  return (
    <div title={official || undefined} style={{ marginTop, minWidth: 0 }}>
      <div style={{ ...lineStyle, fontSize, color: holidayDateTextColor(date, official, plainColor) }}>
        {dateLine}
      </div>
      {holidayLine ? (
        <div style={{ ...lineStyle, fontSize: Math.max(11, fontSize - 1), color: HOLIDAY_RED, marginTop: 1 }}>
          {holidayLine}
        </div>
      ) : null}
    </div>
  );
}
