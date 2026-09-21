export type StorePreset = {
  id: string;
  label: string;
  group: 'iOS' | 'iPad' | 'Android';
  width: number;
  height: number;
  format: 'png' | 'jpeg';
  quality?: number;
  mockup: 'phone' | 'tablet';
};

export type StudioFontId =
  | 'giants-bold'
  | 'giants'
  | 'giants-inline'
  | 'gmarket-bold'
  | 'gmarket'
  | 'cafe24'
  | 'sbaggro'
  | 'scdream';

export type StudioFont = {
  id: StudioFontId;
  label: string;
  group: '눈누 디스플레이' | '본문';
  family: string;
  weight: number;
};

export type StudioBadge = {
  id: string;
  text: string;
  background: string;
  color: string;
};

export type ImageFit = {
  zoom: number;
  panX: number;
  panY: number;
};

/** 원본 이미지 기준 0~1 크롭 영역 (react-easy-crop croppedArea를 정규화) */
export type ImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StudioRect = { x: number; y: number; w: number; h: number; radius: number };

export type StudioSlide = {
  id: string;
  title: string;
  description: string;
  accent: string;
  badges: StudioBadge[];
  imageDataUrl: string;
  imageFit: ImageFit;
  imageCrop: ImageCrop | null;
};

export type DrawOptions = {
  bgMode: 'solid' | 'gradient';
  background: string;
  backgroundTo: string;
  gradientAngle: number;
  accentColor: string;
  titleFont: StudioFontId;
  descFont: StudioFontId;
  titleOpacity: number;
  descOpacity: number;
  bgText: string;
  bgTextFont: StudioFontId;
  bgTextOpacity: number;
  bgTextScale: number;
  bgTextColor: string;
  bgTextRotate: number;
};

export const STORE_PRESETS: StorePreset[] = [
  {
    id: 'ios-6.9',
    label: '아이폰 6.9"',
    group: 'iOS',
    width: 1320,
    height: 2868,
    format: 'png',
    mockup: 'phone',
  },
  {
    id: 'ios-6.7',
    label: '아이폰 6.7"',
    group: 'iOS',
    width: 1290,
    height: 2796,
    format: 'png',
    mockup: 'phone',
  },
  {
    id: 'ios-6.5',
    label: '아이폰 6.5"',
    group: 'iOS',
    width: 1260,
    height: 2736,
    format: 'png',
    mockup: 'phone',
  },
  {
    id: 'ios-ipad-13',
    label: '아이패드 13"',
    group: 'iPad',
    width: 2064,
    height: 2752,
    format: 'png',
    mockup: 'tablet',
  },
  {
    id: 'aos-phone',
    label: '갤럭시 S26 · 360×740',
    group: 'Android',
    width: 1080,
    height: 2220,
    format: 'jpeg',
    quality: 0.92,
    mockup: 'phone',
  },
  {
    id: 'aos-tablet-7',
    label: 'Android 7인치',
    group: 'Android',
    width: 1200,
    height: 1920,
    format: 'jpeg',
    quality: 0.92,
    mockup: 'tablet',
  },
  {
    id: 'aos-tablet-10',
    label: 'Android 10인치',
    group: 'Android',
    width: 1600,
    height: 2560,
    format: 'jpeg',
    quality: 0.92,
    mockup: 'tablet',
  },
];

export const IOS_PHONE_STORE_PRESETS = STORE_PRESETS.filter(
  (preset) => preset.group === 'iOS' && preset.mockup === 'phone',
);

export const STUDIO_FONTS: StudioFont[] = [
  { id: 'giants-bold', label: '자이언트 Bold', group: '눈누 디스플레이', family: 'Giants', weight: 700 },
  { id: 'giants', label: '자이언트 Regular', group: '눈누 디스플레이', family: 'Giants', weight: 400 },
  { id: 'giants-inline', label: '자이언트 Inline', group: '눈누 디스플레이', family: 'Giants-Inline', weight: 400 },
  { id: 'gmarket-bold', label: 'G마켓 산스 Bold', group: '눈누 디스플레이', family: 'GmarketSans', weight: 700 },
  { id: 'gmarket', label: 'G마켓 산스 Medium', group: '눈누 디스플레이', family: 'GmarketSans', weight: 500 },
  { id: 'cafe24', label: '카페24 써라운드', group: '눈누 디스플레이', family: 'Cafe24Ssurround', weight: 400 },
  { id: 'sbaggro', label: 'SB어그로 Bold', group: '눈누 디스플레이', family: 'SBAggro', weight: 700 },
  { id: 'scdream', label: '에스코어드림', group: '본문', family: 'SCDream', weight: 700 },
];

export const DEFAULT_IMAGE_FIT: ImageFit = { zoom: 1, panX: 0, panY: 0 };

export function clampImageFit(fit: ImageFit): ImageFit {
  return {
    zoom: Math.round(Math.min(4, Math.max(1, fit.zoom)) * 100) / 100,
    panX: Math.min(1, Math.max(-1, fit.panX)),
    panY: Math.min(1, Math.max(-1, fit.panY)),
  };
}

export function normalizeImageFit(raw: unknown): ImageFit {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_IMAGE_FIT };
  const fit = raw as Record<string, unknown>;
  return clampImageFit({
    zoom: Number(fit.zoom) || 1,
    panX: Number(fit.panX) || 0,
    panY: Number(fit.panY) || 0,
  });
}

export function normalizeImageCrop(raw: unknown): ImageCrop | null {
  if (!raw || typeof raw !== 'object') return null;
  const crop = raw as Record<string, unknown>;
  let x = Number(crop.x);
  let y = Number(crop.y);
  let width = Number(crop.width);
  let height = Number(crop.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n)) || width <= 0 || height <= 0) {
    return null;
  }
  if (width > 1 || height > 1 || x > 1 || y > 1) {
    x /= 100;
    y /= 100;
    width /= 100;
    height /= 100;
  }
  if (x + width <= 0 || y + height <= 0) return null;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0.01, Math.min(1, width)),
    height: Math.max(0.01, Math.min(1, height)),
  };
}

export function cropFromPercentArea(area: ImageCrop): ImageCrop | null {
  return normalizeImageCrop({
    x: area.x / 100,
    y: area.y / 100,
    width: area.width / 100,
    height: area.height / 100,
  });
}

export function cropToPercentArea(crop: ImageCrop): ImageCrop {
  return {
    x: crop.x * 100,
    y: crop.y * 100,
    width: crop.width * 100,
    height: crop.height * 100,
  };
}

export function cropFromPixelArea(
  pixels: { x: number; y: number; width: number; height: number },
  naturalWidth: number,
  naturalHeight: number,
): ImageCrop | null {
  if (naturalWidth <= 0 || naturalHeight <= 0) return null;
  if (![pixels.x, pixels.y, pixels.width, pixels.height].every((n) => Number.isFinite(n))) return null;
  if (pixels.width <= 0 || pixels.height <= 0) return null;
  return {
    x: Math.max(0, Math.min(1, pixels.x / naturalWidth)),
    y: Math.max(0, Math.min(1, pixels.y / naturalHeight)),
    width: Math.max(0.01, Math.min(1, pixels.width / naturalWidth)),
    height: Math.max(0.01, Math.min(1, pixels.height / naturalHeight)),
  };
}

const MOCKUP = {
  top: 0.255,
  bottomPad: 0.03,
  padX: 0.08,
};

/** 선택한 스토어 규격의 실제 디바이스 화면 비율 */
export function getDeviceAspect(preset: StorePreset): number {
  switch (preset.id) {
    case 'ios-6.9':
      return 1320 / 2868;
    case 'ios-6.7':
      return 1290 / 2796;
    case 'ios-6.5':
      return 1260 / 2736;
    case 'ios-ipad-13':
      return 3 / 4;
    case 'aos-phone':
      return 360 / 740;
    case 'aos-tablet-7':
      return 1200 / 1920;
    case 'aos-tablet-10':
      return 1600 / 2560;
    default:
      return preset.mockup === 'tablet' ? 3 / 4 : 9 / 19.5;
  }
}

export const BADGE_PRESETS: Array<Pick<StudioBadge, 'text' | 'background' | 'color'>> = [
  { text: 'NEW', background: '#FF3B6B', color: '#FFFFFF' },
  { text: 'HOT', background: '#FF6A00', color: '#FFFFFF' },
  { text: 'UPDATE', background: '#1B6FF5', color: '#FFFFFF' },
  { text: '출시', background: '#111827', color: '#FFFFFF' },
];

const NEW_BADGE = (): StudioBadge => ({
  id: `badge-${Math.random().toString(36).slice(2, 8)}`,
  text: 'NEW',
  background: '#FF3B6B',
  color: '#FFFFFF',
});

export const DEFAULT_SLIDES: StudioSlide[] = [
  {
    id: '01-home',
    title: '오고피씽 홈',
    description: '스탬프 · 쿠폰 · 출조 일정을\n한눈에 확인하세요!',
    accent: '한눈에',
    badges: [],
    imageDataUrl: '',
    imageFit: { ...DEFAULT_IMAGE_FIT },
    imageCrop: null,
  },
  {
    id: '02-stamp',
    title: 'QR 스탬프 적립',
    description: 'QR 스캔 기능이 추가되었어요\n이제 앱 하나로 스탬프 적립까지 간편하게!',
    accent: '스탬프 적립',
    badges: [NEW_BADGE()],
    imageDataUrl: '',
    imageFit: { ...DEFAULT_IMAGE_FIT },
    imageCrop: null,
  },
  {
    id: '03-coupons',
    title: '출조 할인 쿠폰',
    description: '모은 스탬프로 쿠폰을 받고\n다음 출조를 더 저렴하게!',
    accent: '더 저렴하게',
    badges: [],
    imageDataUrl: '',
    imageFit: { ...DEFAULT_IMAGE_FIT },
    imageCrop: null,
  },
  {
    id: '04-community',
    title: '낚시 커뮤니티',
    description: '조황 사진 · FAQ · Q&A\n선원들과 정보를 나눠요!',
    accent: '정보를 나눠요',
    badges: [],
    imageDataUrl: '',
    imageFit: { ...DEFAULT_IMAGE_FIT },
    imageCrop: null,
  },
  {
    id: '05-trip-guide',
    title: '출조 일정 안내',
    description: '달력에서 출조를 확인하고\n원하는 날 바로 예약하세요!',
    accent: '바로 예약',
    badges: [],
    imageDataUrl: '',
    imageFit: { ...DEFAULT_IMAGE_FIT },
    imageCrop: null,
  },
  {
    id: '06-point-mall',
    title: '포인트몰',
    description: '게임하고 활동해서 모은 포인트로\n낚시 용품을 구매하세요!',
    accent: '구매하세요',
    badges: [],
    imageDataUrl: '',
    imageFit: { ...DEFAULT_IMAGE_FIT },
    imageCrop: null,
  },
  {
    id: '07-market',
    title: '중고장터',
    description: '선원끼리 안전하게\n중고 장비를 직거래하세요!',
    accent: '직거래',
    badges: [NEW_BADGE()],
    imageDataUrl: '',
    imageFit: { ...DEFAULT_IMAGE_FIT },
    imageCrop: null,
  },
  {
    id: '08-mini-games',
    title: '미니게임',
    description: '틈날 때 게임하고 포인트 모아\n상품으로 바꿔보세요!',
    accent: '바꿔보세요',
    badges: [],
    imageDataUrl: '',
    imageFit: { ...DEFAULT_IMAGE_FIT },
    imageCrop: null,
  },
];

export const DEFAULT_DRAW_OPTIONS: DrawOptions = {
  bgMode: 'gradient',
  background: '#FFFFFF',
  backgroundTo: '#E6E8EC',
  gradientAngle: 180,
  accentColor: '#1B6FF5',
  titleFont: 'giants-bold',
  descFont: 'scdream',
  titleOpacity: 1,
  descOpacity: 1,
  bgText: '오고피씽',
  bgTextFont: 'giants-inline',
  bgTextOpacity: 0.08,
  bgTextScale: 1,
  bgTextColor: '#111827',
  bgTextRotate: -18,
};

export function getStudioFont(id: StudioFontId): StudioFont {
  return STUDIO_FONTS.find((f) => f.id === id) ?? STUDIO_FONTS[0];
}

function canvasFont(font: StudioFont, size: number) {
  return `${font.weight} ${Math.round(size)}px "${font.family}", "SCDream", sans-serif`;
}

export function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  const n = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padEnd(6, '0').slice(0, 6);
  const r = Number.parseInt(n.slice(0, 2), 16) || 0;
  const g = Number.parseInt(n.slice(2, 4), 16) || 0;
  const b = Number.parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

let fontsReady: Promise<void> | null = null;

export function ensureStudioFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (!fontsReady) {
    fontsReady = (async () => {
      await document.fonts.ready;
      await Promise.all(
        STUDIO_FONTS.map((font) =>
          document.fonts.load(`${font.weight} 80px "${font.family}"`).catch(() => undefined),
        ),
      );
    })();
  }
  return fontsReady;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.replace(/\r/g, '').split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const ch of para) {
      const next = current + ch;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = ch;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

function accentPhrases(accent: string): string[] {
  const phrases = accent
    .split(/[,，、]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set(phrases)].sort((a, b) => b.length - a.length);
}

function accentRanges(text: string, accent: string): Array<{ start: number; end: number }> {
  const phrases = accentPhrases(accent);
  if (!phrases.length) return [];
  const taken = new Array<boolean>(text.length).fill(false);
  const ranges: Array<{ start: number; end: number }> = [];
  for (const phrase of phrases) {
    let from = 0;
    while (from <= text.length - phrase.length) {
      const idx = text.indexOf(phrase, from);
      if (idx < 0) break;
      const end = idx + phrase.length;
      let overlap = false;
      for (let i = idx; i < end; i++) {
        if (taken[i]) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        for (let i = idx; i < end; i++) taken[i] = true;
        ranges.push({ start: idx, end });
      }
      from = idx + 1;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

function fillCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  accent: string,
  accentColor: string,
  baseColor: string,
) {
  const ranges = accentRanges(text, accent);
  if (!ranges.length) {
    ctx.fillStyle = baseColor;
    ctx.fillText(text, cx, y);
    return;
  }

  const parts: Array<{ text: string; highlight: boolean }> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start), highlight: false });
    parts.push({ text: text.slice(range.start, range.end), highlight: true });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlight: false });

  const total = parts.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let x = cx - total / 2;
  const fontSize = Number.parseFloat(ctx.font) || 32;
  const underlineH = Math.max(4, fontSize * 0.08);
  for (const part of parts) {
    const width = ctx.measureText(part.text).width;
    ctx.fillStyle = part.highlight ? accentColor : baseColor;
    ctx.fillText(part.text, x, y);
    if (part.highlight) {
      ctx.fillRect(x, y + fontSize * 0.18, width, underlineH);
    }
    x += width;
  }
  ctx.textAlign = prevAlign;
}

function fillBackground(ctx: CanvasRenderingContext2D, w: number, h: number, options: DrawOptions) {
  if (options.bgMode === 'gradient') {
    const rad = (options.gradientAngle * Math.PI) / 180;
    const cx = w / 2;
    const cy = h / 2;
    const len = Math.hypot(w, h) / 2;
    const g = ctx.createLinearGradient(
      cx - Math.cos(rad) * len,
      cy - Math.sin(rad) * len,
      cx + Math.cos(rad) * len,
      cy + Math.sin(rad) * len,
    );
    g.addColorStop(0, options.background);
    g.addColorStop(1, options.backgroundTo);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = options.background;
  }
  ctx.fillRect(0, 0, w, h);
}

function drawBackgroundText(ctx: CanvasRenderingContext2D, w: number, h: number, options: DrawOptions) {
  const text = options.bgText.trim();
  if (!text || options.bgTextOpacity <= 0) return;
  const font = getStudioFont(options.bgTextFont);
  const size = Math.round(w * 0.22 * Math.max(0.2, options.bgTextScale));
  ctx.save();
  ctx.translate(w / 2, h * 0.58);
  ctx.rotate((options.bgTextRotate * Math.PI) / 180);
  ctx.font = canvasFont(font, size);
  ctx.fillStyle = withAlpha(options.bgTextColor, options.bgTextOpacity);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawBadgeRow(
  ctx: CanvasRenderingContext2D,
  badges: StudioBadge[],
  cx: number,
  y: number,
  badgeSize: number,
) {
  const visible = badges.filter((b) => b.text.trim());
  if (!visible.length) return 0;
  ctx.font = canvasFont(getStudioFont('scdream'), badgeSize);
  const gap = badgeSize * 0.35;
  const pads = visible.map((b) => {
    const tw = ctx.measureText(b.text.trim()).width;
    return { ...b, tw, bw: tw + badgeSize * 1.5, bh: badgeSize * 1.65 };
  });
  const total = pads.reduce((sum, b) => sum + b.bw, 0) + gap * (pads.length - 1);
  let x = cx - total / 2;
  const bh = pads[0].bh;
  for (const b of pads) {
    ctx.fillStyle = b.background;
    roundRect(ctx, x, y, b.bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(b.text.trim(), x + b.bw / 2, y + bh * 0.7);
    x += b.bw + gap;
  }
  return bh;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = src;
  });
  return img;
}

function fitRect(areaW: number, areaH: number, aspect: number) {
  if (areaW / areaH > aspect) {
    const h = areaH;
    const w = h * aspect;
    return { w, h, x: (areaW - w) / 2, y: 0 };
  }
  const w = areaW;
  const h = w / aspect;
  return { w, h, x: 0, y: (areaH - h) / 2 };
}

export function getMockupLayout(preset: StorePreset): { body: StudioRect; screen: StudioRect } {
  const w = preset.width;
  const h = preset.height;
  const padX = w * MOCKUP.padX;
  const area = {
    x: padX,
    y: h * MOCKUP.top,
    w: w - padX * 2,
    h: h - h * MOCKUP.top - h * MOCKUP.bottomPad,
  };
  const aspect = getDeviceAspect(preset);
  const fitted = fitRect(area.w, area.h, aspect);
  const dx = area.x + fitted.x;
  const dy = area.y + fitted.y;
  const dw = fitted.w;
  const dh = fitted.h;
  const radius = preset.mockup === 'tablet' ? dw * 0.055 : dw * 0.12;
  const bezel = preset.mockup === 'tablet' ? dw * 0.028 : dw * 0.038;
  return {
    body: { x: dx, y: dy, w: dw, h: dh, radius },
    screen: {
      x: dx + bezel,
      y: dy + bezel,
      w: dw - bezel * 2,
      h: dh - bezel * 2,
      radius: Math.max(8, radius - bezel * 0.7),
    },
  };
}

export function pointInRect(x: number, y: number, rect: StudioRect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  screen: StudioRect,
  fit: ImageFit,
) {
  const zoom = Math.max(1, fit.zoom);
  const scale = Math.max(screen.w / img.naturalWidth, screen.h / img.naturalHeight) * zoom;
  const iw = img.naturalWidth * scale;
  const ih = img.naturalHeight * scale;
  const maxPanX = Math.max(0, (iw - screen.w) / 2);
  const maxPanY = Math.max(0, (ih - screen.h) / 2);
  const dx = screen.x + (screen.w - iw) / 2 + fit.panX * maxPanX;
  const dy = screen.y + (screen.h - ih) / 2 + fit.panY * maxPanY;
  ctx.drawImage(img, dx, dy, iw, ih);
}

function drawCroppedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  screen: StudioRect,
  crop: ImageCrop,
) {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const sx = Math.max(0, Math.min(nw - 1, Math.round(crop.x * nw)));
  const sy = Math.max(0, Math.min(nh - 1, Math.round(crop.y * nh)));
  const sw = Math.max(1, Math.min(nw - sx, Math.round(crop.width * nw)));
  const sh = Math.max(1, Math.min(nh - sy, Math.round(crop.height * nh)));
  const srcAspect = sw / sh;
  const dstAspect = screen.w / screen.h;
  let dx = screen.x;
  let dy = screen.y;
  let dw = screen.w;
  let dh = screen.h;
  if (srcAspect > dstAspect) {
    dw = screen.h * srcAspect;
    dx = screen.x + (screen.w - dw) / 2;
  } else {
    dh = screen.w / srcAspect;
    dy = screen.y + (screen.h - dh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export function imagePanStep(
  screen: StudioRect,
  imgW: number,
  imgH: number,
  zoom: number,
  canvasDx: number,
  canvasDy: number,
) {
  const scale = Math.max(screen.w / imgW, screen.h / imgH) * Math.max(1, zoom);
  const maxPanX = Math.max(0, (imgW * scale - screen.w) / 2);
  const maxPanY = Math.max(0, (imgH * scale - screen.h) / 2);
  return {
    panX: maxPanX > 0 ? canvasDx / maxPanX : 0,
    panY: maxPanY > 0 ? canvasDy / maxPanY : 0,
  };
}

async function drawDeviceMockup(
  ctx: CanvasRenderingContext2D,
  slide: StudioSlide,
  preset: StorePreset,
  placeholderSize: number,
) {
  const { body, screen } = getMockupLayout(preset);
  const dx = body.x;
  const dy = body.y;
  const dw = body.w;
  const dh = body.h;
  const radius = body.radius;
  const sx = screen.x;
  const sy = screen.y;
  const sw = screen.w;
  const sh = screen.h;
  const sr = screen.radius;

  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.38)';
  ctx.shadowBlur = dw * 0.14;
  ctx.shadowOffsetY = dw * 0.06;
  roundRect(ctx, dx, dy, dw, dh, radius);
  ctx.fillStyle = '#111111';
  ctx.fill();
  ctx.restore();

  roundRect(ctx, dx, dy, dw, dh, radius);
  const bodyGrad = ctx.createLinearGradient(dx, dy, dx + dw, dy);
  bodyGrad.addColorStop(0, '#2A2A2C');
  bodyGrad.addColorStop(0.45, '#111111');
  bodyGrad.addColorStop(1, '#1C1C1E');
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  ctx.save();
  roundRect(ctx, sx, sy, sw, sh, sr);
  ctx.clip();
  ctx.fillStyle = '#F3F4F6';
  ctx.fillRect(sx, sy, sw, sh);

  if (slide.imageDataUrl) {
    try {
      const img = await loadImage(slide.imageDataUrl);
      const crop = normalizeImageCrop(slide.imageCrop);
      if (crop) {
        drawCroppedImage(ctx, img, screen, crop);
      } else {
        drawFittedImage(ctx, img, screen, slide.imageFit ?? DEFAULT_IMAGE_FIT);
      }
    } catch {
      ctx.fillStyle = '#9CA3AF';
      ctx.font = canvasFont(getStudioFont('scdream'), placeholderSize);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('이미지를 넣어 주세요', sx + sw / 2, sy + sh / 2);
    }
  } else {
    ctx.fillStyle = '#9CA3AF';
    ctx.font = canvasFont(getStudioFont('scdream'), placeholderSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('이미지를 넣어 주세요', sx + sw / 2, sy + sh / 2);
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = Math.max(2, dw * 0.006);
  roundRect(ctx, dx + 1.5, dy + 1.5, dw - 3, dh - 3, radius);
  ctx.stroke();
}

export async function drawStudioSlide(
  canvas: HTMLCanvasElement,
  slide: StudioSlide,
  preset: StorePreset,
  options: DrawOptions,
) {
  const { width: w, height: h } = preset;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D를 사용할 수 없습니다.');

  await ensureStudioFonts();

  fillBackground(ctx, w, h, options);
  drawBackgroundText(ctx, w, h, options);

  const padX = w * MOCKUP.padX;
  const titleFont = getStudioFont(options.titleFont);
  const descFont = getStudioFont(options.descFont);
  const titleSize = Math.round(h * (titleFont.family.startsWith('Giants') ? 0.048 : 0.05));
  const subSize = Math.round(h * 0.02);
  const badgeSize = Math.round(h * 0.018);
  let y = h * 0.042;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const badgeH = drawBadgeRow(ctx, slide.badges, w / 2, y, badgeSize);
  if (badgeH) y += badgeH + h * 0.012;

  ctx.fillStyle = withAlpha('#111827', options.titleOpacity);
  ctx.font = canvasFont(titleFont, titleSize);
  const titleLines = wrapLines(ctx, slide.title.trim() || '제목', w - padX * 2);
  for (const line of titleLines) {
    ctx.fillText(line, w / 2, y + titleSize);
    y += titleSize * 1.16;
  }
  y += h * 0.008;

  ctx.font = canvasFont(descFont, subSize);
  const descLines = wrapLines(ctx, slide.description.trim(), w - padX * 2);
  const descColor = withAlpha('#4B5563', options.descOpacity);
  const accentColor = withAlpha(options.accentColor, options.descOpacity);
  for (const line of descLines) {
    fillCentered(ctx, line, w / 2, y + subSize, slide.accent.trim(), accentColor, descColor);
    y += subSize * 1.42;
  }

  await drawDeviceMockup(ctx, slide, preset, Math.round(subSize * 0.95));
}

export async function exportStudioSlide(
  slide: StudioSlide,
  preset: StorePreset,
  options: DrawOptions,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await drawStudioSlide(canvas, slide, preset, options);
  const mime = preset.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, preset.quality ?? 0.92),
  );
  if (!blob) throw new Error('이미지 내보내기에 실패했습니다.');
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function slideFilename(slide: StudioSlide, index: number, preset: StorePreset) {
  const ext = preset.format === 'jpeg' ? 'jpg' : 'png';
  const safeId = slide.id.replace(/[^a-zA-Z0-9._-]+/g, '-') || `slide`;
  return `${String(index + 1).padStart(2, '0')}-${safeId}-${preset.id}.${ext}`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

export function newStudioBadge(
  preset?: Pick<StudioBadge, 'text' | 'background' | 'color'>,
): StudioBadge {
  const base = preset ?? BADGE_PRESETS[0];
  return {
    id: `badge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text: base.text,
    background: base.background,
    color: base.color,
  };
}

export function newStudioSlide(): StudioSlide {
  return {
    id: `slide-${Date.now()}`,
    title: '',
    description: '',
    accent: '',
    badges: [],
    imageDataUrl: '',
    imageFit: { ...DEFAULT_IMAGE_FIT },
    imageCrop: null,
  };
}
