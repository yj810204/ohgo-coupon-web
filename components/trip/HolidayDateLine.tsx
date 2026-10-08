'use client';

import { holidayDateParts, holidayDateTextColor } from '@/lib/holiday-date-label';
import { HOLIDAY_RED } from '@/lib/kr-holidays';

const HOLIDAY_FONT_SIZE = 11;
const HOLIDAY_LINE_HEIGHT = 13;

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
      <div
        aria-hidden={holidayLine ? undefined : true}
        style={{
          ...lineStyle,
          height: HOLIDAY_LINE_HEIGHT,
          marginTop: 1,
          fontSize: HOLIDAY_FONT_SIZE,
          lineHeight: `${HOLIDAY_LINE_HEIGHT}px`,
          fontWeight: 600,
          color: HOLIDAY_RED,
          visibility: holidayLine ? 'visible' : 'hidden',
        }}
      >
        {holidayLine || '\u00a0'}
      </div>
    </div>
  );
}
