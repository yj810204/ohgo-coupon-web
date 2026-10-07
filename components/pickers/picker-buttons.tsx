'use client';

import type { CSSProperties } from 'react';
import { OHGO_FONT } from '@/lib/page-styles';

export function pickerActionStyle(primary: boolean): CSSProperties {
  return {
    flex: 1,
    borderRadius: 10,
    border: primary ? 'none' : '1px solid #E6E8EC',
    background: primary ? '#237FFF' : '#FFFFFF',
    color: primary ? '#FFFFFF' : '#1A1D1F',
    fontFamily: OHGO_FONT,
    fontWeight: 700,
    fontSize: 15,
    padding: '10px 12px',
  };
}
