/** Travelia-inspired design tokens (Figma reference) */
export const colors = {
  primary: '#1B6FF5',
  primaryDark: '#1558C4',
  background: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#1A1D1F',
  textMuted: '#6F767E',
  border: '#EFEFEF',
  accentOrange: '#FF9500',
  accentGreen: '#34C759',
  gradientStart: '#1B6FF5',
  gradientEnd: '#5B8DEF',
} as const;

export const shadows = {
  card: '0 2px 8px rgba(0, 0, 0, 0.06)',
  cardHover: '0 4px 16px rgba(0, 0, 0, 0.1)',
} as const;

export const radius = {
  card: '16px',
  pill: '999px',
  button: '12px',
} as const;

export const spacing = {
  pageX: '20px',
  sectionGap: '32px',
  cardGap: '16px',
} as const;
