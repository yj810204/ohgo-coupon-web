/** Band 웹 색표(color01~color11)와 같은 hex. 편집기 팔레트와 가져온 글이 이 값으로 맞는다. */
export const BAND_EDITOR_COLORS: Array<{ color: string; label: string }> = [
  { color: '#ff3692', label: '분홍' },
  { color: '#ff3445', label: '빨강' },
  { color: '#ff540b', label: '주황' },
  { color: '#ff9900', label: '노랑' },
  { color: '#00c73c', label: '초록' },
  { color: '#00c4a1', label: '청록' },
  { color: '#18b2fa', label: '하늘' },
  { color: '#4f77fd', label: '파랑' },
  { color: '#7e5bff', label: '보라' },
  { color: '#909090', label: '회색' },
  { color: '#56616a', label: '진회색' },
];

/** 기본 크기, 그리고 Band 글자 크기 l(18px), xl(22px) */
export const EDITOR_FONT_SIZE_OPTIONS = [
  'default',
  { title: '18', model: '18px' },
  { title: '22', model: '22px' },
] as const;
