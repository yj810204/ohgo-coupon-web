'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  BADGE_PRESETS,
  DEFAULT_DRAW_OPTIONS,
  DEFAULT_IMAGE_FIT,
  DEFAULT_SLIDES,
  IOS_PHONE_STORE_PRESETS,
  STORE_PRESETS,
  STUDIO_FONTS,
  downloadBlob,
  drawStudioSlide,
  ensureStudioFonts,
  exportStudioSlide,
  fileToDataUrl,
  getMockupLayout,
  newStudioBadge,
  newStudioSlide,
  normalizeImageCrop,
  normalizeImageFit,
  slideFilename,
  type DrawOptions,
  type ImageCrop,
  type StudioBadge,
  type StudioSlide,
  type StorePreset,
} from '@/lib/store-screenshot-studio';
import { OHGO_FONT } from '@/lib/page-styles';
import {
  IoAddOutline,
  IoArrowBackOutline,
  IoArrowDownOutline,
  IoArrowUpOutline,
  IoCropOutline,
  IoDownloadOutline,
  IoImageOutline,
  IoTrashOutline,
} from 'react-icons/io5';
import { ohgoConfirm } from '@/lib/ohgo-dialog';
import StudioImageCropModal from '@/components/screenshot-studio/StudioImageCropModal';
import './studio-fonts.css';

const STORAGE_KEY = 'ohgo-screenshot-studio-v2';
const FONT = OHGO_FONT;

const BG_PRESETS = [
  { id: 'white', label: '흰색', from: '#FFFFFF', to: '#FFFFFF', mode: 'solid' as const },
  { id: 'gray', label: '연회색', from: '#F4F5F7', to: '#E6E8EC', mode: 'gradient' as const },
  { id: 'cool', label: '쿨그레이', from: '#F7FAFC', to: '#DDE3EA', mode: 'gradient' as const },
  { id: 'blue', label: '블루', from: '#E8F1FF', to: '#C5D8FF', mode: 'gradient' as const },
  { id: 'purple', label: '퍼플', from: '#F3E8FF', to: '#D6C4F5', mode: 'gradient' as const },
];

type PersistShape = {
  slides?: unknown;
  options?: Partial<DrawOptions>;
};

function asSlide(raw: unknown): StudioSlide | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const badges: StudioBadge[] = Array.isArray(s.badges)
    ? s.badges
        .map((b) => {
          if (!b || typeof b !== 'object') return null;
          const item = b as Record<string, unknown>;
          return {
            id: String(item.id || `badge-${Math.random()}`),
            text: String(item.text || ''),
            background: String(item.background || '#FF3B6B'),
            color: String(item.color || '#FFFFFF'),
          };
        })
        .filter((b): b is StudioBadge => Boolean(b))
    : typeof s.badge === 'string' && s.badge.trim()
      ? [newStudioBadge({ text: s.badge.trim(), background: '#FF3B6B', color: '#FFFFFF' })]
      : [];
  return {
    id: String(s.id || `slide-${Math.random()}`),
    title: String(s.title || ''),
    description: String(s.description || ''),
    accent: String(s.accent || ''),
    badges,
    imageDataUrl: typeof s.imageDataUrl === 'string' ? s.imageDataUrl : '',
    imageFit: normalizeImageFit(s.imageFit),
    imageCrop: normalizeImageCrop(s.imageCrop),
  };
}

function loadSaved(): { slides: StudioSlide[]; options: DrawOptions } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('ohgo-screenshot-studio-v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistShape | StudioSlide[];
    if (Array.isArray(parsed)) {
      const slides = parsed.map(asSlide).filter((s): s is StudioSlide => Boolean(s));
      return slides.length ? { slides, options: DEFAULT_DRAW_OPTIONS } : null;
    }
    const slides = Array.isArray(parsed.slides)
      ? parsed.slides.map(asSlide).filter((s): s is StudioSlide => Boolean(s))
      : [];
    return slides.length
      ? { slides, options: { ...DEFAULT_DRAW_OPTIONS, ...parsed.options } }
      : null;
  } catch {
    return null;
  }
}

export default function StoreScreenshotStudio({ backHref }: { backHref?: string }) {
  const [slides, setSlides] = useState<StudioSlide[]>(DEFAULT_SLIDES);
  const [index, setIndex] = useState(0);
  const [presetId, setPresetId] = useState(STORE_PRESETS[0].id);
  const [opts, setOpts] = useState<DrawOptions>(DEFAULT_DRAW_OPTIONS);
  const [busy, setBusy] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [cropping, setCropping] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const preset = useMemo(
    () => STORE_PRESETS.find((p) => p.id === presetId) ?? STORE_PRESETS[0],
    [presetId],
  );
  const slide = slides[index] ?? slides[0];
  const mockupLayout = useMemo(() => getMockupLayout(preset), [preset]);
  const cropAspect =
    mockupLayout.screen.h > 0 ? mockupLayout.screen.w / mockupLayout.screen.h : 9 / 19.5;

  useEffect(() => {
    setCropping(false);
  }, [index]);

  useEffect(() => {
    void ensureStudioFonts();
    const saved = loadSaved();
    if (saved) {
      setSlides(saved.slides);
      setOpts(saved.options);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            options: opts,
            slides: slides.map(({ imageDataUrl: _img, ...rest }) => rest),
          }),
        );
      } catch {
        /* quota */
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [slides, opts, hydrated]);

  const redraw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !slide) return;
    await drawStudioSlide(canvas, slide, preset, opts);
  }, [slide, preset, opts]);

  useEffect(() => {
    void redraw();
  }, [redraw]);

  const patchOpts = (patch: Partial<DrawOptions>) => setOpts((prev) => ({ ...prev, ...patch }));

  const updateSlide = (patch: Partial<StudioSlide>) => {
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const updateBadge = (badgeId: string, patch: Partial<StudioBadge>) => {
    updateSlide({
      badges: (slide?.badges ?? []).map((b) => (b.id === badgeId ? { ...b, ...patch } : b)),
    });
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    updateSlide({
      imageDataUrl: await fileToDataUrl(file),
      imageFit: { ...DEFAULT_IMAGE_FIT },
      imageCrop: null,
    });
    setCropping(true);
  };

  const applyCrop = (crop: ImageCrop) => {
    updateSlide({
      imageCrop: crop,
      imageFit: { ...DEFAULT_IMAGE_FIT },
    });
    setCropping(false);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) void onPickFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [index]);

  const exportOne = async (target: StorePreset, targetSlide = slide, slideIndex = index) => {
    const blob = await exportStudioSlide(targetSlide, target, opts);
    downloadBlob(blob, slideFilename(targetSlide, slideIndex, target));
  };

  const exportCurrent = async () => {
    setBusy('내보내는 중…');
    try {
      await exportOne(preset);
    } finally {
      setBusy('');
    }
  };

  const exportAllForPreset = async (target: StorePreset) => {
    setBusy(`${target.label} 전체 내보내는 중…`);
    try {
      for (let i = 0; i < slides.length; i++) {
        await exportOne(target, slides[i], i);
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      setBusy('');
    }
  };

  const exportAllIosPhones = async () => {
    setBusy('아이폰 6.5/6.7/6.9 내보내는 중…');
    try {
      for (const target of IOS_PHONE_STORE_PRESETS) {
        for (let i = 0; i < slides.length; i++) {
          await exportOne(target, slides[i], i);
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    } finally {
      setBusy('');
    }
  };

  const removeSlide = async (slideIndex: number) => {
    if (slides.length <= 1) return;
    if (!(await ohgoConfirm('이 슬라이드를 삭제할까요?'))) return;
    setSlides((prev) => prev.filter((_, i) => i !== slideIndex));
    setIndex((current) => {
      if (slideIndex < current) return current - 1;
      return Math.min(current, slides.length - 2);
    });
  };

  const grouped = useMemo(() => {
    const map = new Map<string, StorePreset[]>();
    for (const p of STORE_PRESETS) {
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    return [...map.entries()];
  }, []);

  const previewScale = Math.min(360 / preset.width, 640 / preset.height);

  const fieldStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    border: '1.5px solid #E5E7EB',
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: FONT,
    outline: 'none',
    background: '#fff',
  };

  const btnPrimary: CSSProperties = {
    border: 'none',
    background: '#1B6FF5',
    color: '#fff',
    borderRadius: 12,
    padding: '12px 14px',
    fontWeight: 700,
    fontFamily: FONT,
    fontSize: 14,
    cursor: 'pointer',
  };

  const btnGhost: CSSProperties = {
    border: '1.5px solid #E5E7EB',
    background: '#fff',
    color: '#1A1D1F',
    borderRadius: 12,
    padding: '10px 12px',
    fontWeight: 700,
    fontFamily: FONT,
    fontSize: 13,
    cursor: 'pointer',
  };

  const sectionLabel: CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 800,
    margin: '16px 0 8px',
    color: '#111827',
    letterSpacing: 0.2,
  };

  const hint: CSSProperties = { fontSize: 11, color: '#9CA3AF', margin: '0 0 8px' };

  const FontPicker = ({
    value,
    onChange,
  }: {
    value: DrawOptions['titleFont'];
    onChange: (id: DrawOptions['titleFont']) => void;
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      {STUDIO_FONTS.map((font) => {
        const selected = value === font.id;
        return (
          <button
            key={font.id}
            type="button"
            onClick={() => onChange(font.id)}
            style={{
              ...btnGhost,
              textAlign: 'left',
              background: selected ? '#EBF1FE' : '#fff',
              borderColor: selected ? '#1B6FF5' : '#E5E7EB',
              fontFamily: `"${font.family}", ${FONT}`,
              fontWeight: font.weight,
              fontSize: 15,
            }}
          >
            {font.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="studio-shell" style={{ fontFamily: FONT }}>
      <header
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid #EFEFEF',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {backHref ? (
            <a href={backHref} style={{ ...btnGhost, padding: '8px 10px', textDecoration: 'none' }}>
              <IoArrowBackOutline style={{ verticalAlign: 'middle' }} />
            </a>
          ) : null}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1B6FF5', letterSpacing: 0.3 }}>
              STORE SCREENSHOT STUDIO
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: '2px 0 0' }}>스토어 스크린샷 만들기</h1>
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#6F767E', fontWeight: 700 }}>
          {preset.label} · {preset.width}×{preset.height}
          {busy ? ` · ${busy}` : ''}
        </div>
      </header>

      <div className="studio-grid">
        <aside className="studio-panel studio-panel--left">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>슬라이드 {slides.length}/10</strong>
            <button
              type="button"
              className="studio-btn-inline"
              style={{ ...btnGhost, padding: '6px 10px', flexShrink: 0 }}
              disabled={slides.length >= 10}
              onClick={() => {
                setSlides((prev) => [...prev, newStudioSlide()]);
                setIndex(slides.length);
              }}
            >
              <IoAddOutline size={16} />
              추가
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slides.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: i === index ? '1.5px solid #1B6FF5' : '1.5px solid #EFEFEF',
                  background: i === index ? '#EBF1FE' : '#fff',
                  borderRadius: 12,
                  padding: '8px 8px 8px 10px',
                  minWidth: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  style={{
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    fontFamily: FONT,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700 }}>
                    {String(i + 1).padStart(2, '0')}
                    {s.badges[0]?.text ? ` · ${s.badges.map((b) => b.text).filter(Boolean).join(' ')}` : ''}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{s.title || '제목 없음'}</div>
                </button>
                <button
                  type="button"
                  className="studio-btn-inline"
                  title="슬라이드 삭제"
                  aria-label={`${i + 1}번 슬라이드 삭제`}
                  disabled={slides.length <= 1}
                  onClick={() => void removeSlide(i)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 4,
                    color: slides.length <= 1 ? '#D1D5DB' : '#DC2626',
                    flexShrink: 0,
                    borderRadius: 8,
                  }}
                >
                  <IoTrashOutline size={16} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section
          className="studio-preview"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onPickFile(e.dataTransfer.files[0]);
          }}
        >
          <div className="studio-device-row">
            {STORE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={presetId === p.id ? 'is-on' : undefined}
                onClick={() => setPresetId(p.id)}
              >
                {p.label}
                <span style={{ display: 'block', fontSize: 10, fontWeight: 600, opacity: 0.72 }}>
                  {p.width}×{p.height}
                </span>
              </button>
            ))}
          </div>
          <div
            className="studio-preview-frame"
            style={{
              width: preset.width * previewScale,
              height: preset.height * previewScale,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: preset.width * previewScale,
                height: preset.height * previewScale,
                display: 'block',
              }}
            />
            {slide?.imageDataUrl ? (
              <button
                type="button"
                className="studio-mockup-hit"
                style={{
                  left: mockupLayout.screen.x * previewScale,
                  top: mockupLayout.screen.y * previewScale,
                  width: mockupLayout.screen.w * previewScale,
                  height: mockupLayout.screen.h * previewScale,
                  borderRadius: mockupLayout.screen.radius * previewScale,
                }}
                onClick={() => setCropping(true)}
              >
                <span>
                  <IoCropOutline size={14} />
                  이미지 편집
                </span>
              </button>
            ) : null}
          </div>
          <p style={{ marginTop: 10, fontSize: 12, color: '#6F767E' }}>
            {slide?.imageDataUrl
              ? '화면을 누르면 이미지를 편집할 수 있습니다'
              : '미리보기 · 이미지를 끌어다 놓거나 붙여넣기(⌘V) 하세요'}
          </p>
        </section>

        <aside className="studio-panel studio-panel--right">
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>제목</label>
          <input
            style={{ ...fieldStyle, marginBottom: 12, fontWeight: 700, fontSize: 16 }}
            value={slide?.title ?? ''}
            onChange={(e) => updateSlide({ title: e.target.value })}
            placeholder="QR 스탬프 적립"
          />

          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>설명</label>
          <textarea
            style={{ ...fieldStyle, marginBottom: 12, minHeight: 88, resize: 'vertical', lineHeight: 1.45 }}
            value={slide?.description ?? ''}
            onChange={(e) => updateSlide({ description: e.target.value })}
            placeholder={'QR 스캔 기능이 추가되었어요\n이제 앱 하나로 스탬프 적립까지 간편하게!'}
          />

          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            강조 문구 (설명에서 찾을 단어)
          </label>
          <input
            style={{ ...fieldStyle, marginBottom: 4 }}
            value={slide?.accent ?? ''}
            onChange={(e) => updateSlide({ accent: e.target.value })}
            placeholder="조황, 정보"
          />
          <p style={{ ...hint, marginTop: 0, marginBottom: 12 }}>여러 개일 때는 콤마로 구분하세요.</p>

          <div style={sectionLabel}>타이틀 배지</div>
          <p style={hint}>제목 위에 여러 개 붙일 수 있습니다.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {BADGE_PRESETS.map((presetBadge) => (
              <button
                key={presetBadge.text}
                type="button"
                style={{
                  ...btnGhost,
                  padding: '6px 10px',
                  background: presetBadge.background,
                  color: presetBadge.color,
                  borderColor: 'transparent',
                  fontSize: 12,
                }}
                onClick={() => updateSlide({ badges: [...(slide?.badges ?? []), newStudioBadge(presetBadge)] })}
              >
                + {presetBadge.text}
              </button>
            ))}
          </div>
          {(slide?.badges ?? []).map((badge) => (
            <div key={badge.id} className="studio-badge-row">
              <input
                style={{ ...fieldStyle, padding: '8px 10px' }}
                value={badge.text}
                onChange={(e) => updateBadge(badge.id, { text: e.target.value })}
                placeholder="배지 문구"
              />
              <input
                type="color"
                className="studio-color"
                value={badge.background}
                onChange={(e) => updateBadge(badge.id, { background: e.target.value })}
                title="배지 배경"
              />
              <input
                type="color"
                className="studio-color"
                value={badge.color}
                onChange={(e) => updateBadge(badge.id, { color: e.target.value })}
                title="배지 글자"
              />
              <button
                type="button"
                className="studio-btn-inline"
                aria-label="배지 삭제"
                style={{ ...btnGhost, width: 32, height: 32, padding: 0, color: '#DC2626', flexShrink: 0 }}
                onClick={() =>
                  updateSlide({ badges: (slide?.badges ?? []).filter((b) => b.id !== badge.id) })
                }
              >
                <IoTrashOutline size={16} />
              </button>
            </div>
          ))}

          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, margin: '12px 0 6px' }}>화면 이미지</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="studio-btn-inline"
              style={btnGhost}
              onClick={() => fileRef.current?.click()}
            >
              <IoImageOutline size={16} />
              이미지 선택
            </button>
            {slide?.imageDataUrl ? (
              <>
                <button
                  type="button"
                  className="studio-btn-inline studio-btn-ghost"
                  onClick={() => setCropping(true)}
                >
                  <IoCropOutline size={16} />
                  이미지 편집
                </button>
                <button
                  type="button"
                  className="studio-btn-inline"
                  style={btnGhost}
                  onClick={() => {
                    updateSlide({
                      imageDataUrl: '',
                      imageFit: { ...DEFAULT_IMAGE_FIT },
                      imageCrop: null,
                    });
                    setCropping(false);
                  }}
                >
                  이미지 제거
                </button>
              </>
            ) : null}
          </div>
          <p style={hint}>이미지를 선택하면 편집 화면이 열립니다.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void onPickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          <div style={sectionLabel}>제목 폰트</div>
          <FontPicker value={opts.titleFont} onChange={(titleFont) => patchOpts({ titleFont })} />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            제목 투명도 {Math.round(opts.titleOpacity * 100)}%
          </label>
          <input
            type="range"
            min={0.15}
            max={1}
            step={0.05}
            value={opts.titleOpacity}
            onChange={(e) => patchOpts({ titleOpacity: Number(e.target.value) })}
            style={{ width: '100%', marginBottom: 12 }}
          />

          <div style={sectionLabel}>설명 폰트</div>
          <FontPicker value={opts.descFont} onChange={(descFont) => patchOpts({ descFont })} />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            설명 투명도 {Math.round(opts.descOpacity * 100)}%
          </label>
          <input
            type="range"
            min={0.15}
            max={1}
            step={0.05}
            value={opts.descOpacity}
            onChange={(e) => patchOpts({ descOpacity: Number(e.target.value) })}
            style={{ width: '100%', marginBottom: 8 }}
          />

          <div style={sectionLabel}>배경</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {BG_PRESETS.map((bg) => (
              <button
                key={bg.id}
                type="button"
                onClick={() =>
                  patchOpts({
                    bgMode: bg.mode,
                    background: bg.from,
                    backgroundTo: bg.to,
                  })
                }
                style={{
                  ...btnGhost,
                  background: `linear-gradient(180deg, ${bg.from}, ${bg.to})`,
                  outline:
                    opts.background === bg.from && opts.backgroundTo === bg.to ? '2px solid #1B6FF5' : 'none',
                }}
              >
                {bg.label}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={opts.bgMode === 'gradient'}
              onChange={(e) => patchOpts({ bgMode: e.target.checked ? 'gradient' : 'solid' })}
            />
            그라데이션
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={hint}>시작</div>
              <input
                type="color"
                value={opts.background}
                onChange={(e) => patchOpts({ background: e.target.value })}
                style={{ width: 42, height: 38, border: 'none', padding: 0, cursor: 'pointer' }}
              />
            </div>
            {opts.bgMode === 'gradient' ? (
              <>
                <div>
                  <div style={hint}>끝</div>
                  <input
                    type="color"
                    value={opts.backgroundTo}
                    onChange={(e) => patchOpts({ backgroundTo: e.target.value })}
                    style={{ width: 42, height: 38, border: 'none', padding: 0, cursor: 'pointer' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={hint}>각도 {opts.gradientAngle}°</div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={5}
                    value={opts.gradientAngle}
                    onChange={(e) => patchOpts({ gradientAngle: Number(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
              </>
            ) : null}
          </div>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>강조색</label>
          <input
            type="color"
            value={opts.accentColor}
            onChange={(e) => patchOpts({ accentColor: e.target.value })}
            style={{ width: 42, height: 38, border: 'none', padding: 0, cursor: 'pointer', marginBottom: 8 }}
          />

          <div style={sectionLabel}>배경 문구</div>
          <p style={hint}>목업 뒤에 큰 글자를 깔아 둡니다. 비우면 표시하지 않습니다.</p>
          <input
            style={{ ...fieldStyle, marginBottom: 10 }}
            value={opts.bgText}
            onChange={(e) => patchOpts({ bgText: e.target.value })}
            placeholder="오고피씽"
          />
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>배경 문구 폰트</div>
          <FontPicker value={opts.bgTextFont} onChange={(bgTextFont) => patchOpts({ bgTextFont })} />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            배경 문구 투명도 {Math.round(opts.bgTextOpacity * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={0.4}
            step={0.01}
            value={opts.bgTextOpacity}
            onChange={(e) => patchOpts({ bgTextOpacity: Number(e.target.value) })}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            크기 {opts.bgTextScale.toFixed(1)}×
          </label>
          <input
            type="range"
            min={0.4}
            max={2.2}
            step={0.1}
            value={opts.bgTextScale}
            onChange={(e) => patchOpts({ bgTextScale: Number(e.target.value) })}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            회전 {opts.bgTextRotate}°
          </label>
          <input
            type="range"
            min={-40}
            max={40}
            step={1}
            value={opts.bgTextRotate}
            onChange={(e) => patchOpts({ bgTextRotate: Number(e.target.value) })}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <div style={hint}>글자색</div>
          <input
            type="color"
            value={opts.bgTextColor}
            onChange={(e) => patchOpts({ bgTextColor: e.target.value })}
            style={{ width: 42, height: 38, border: 'none', padding: 0, cursor: 'pointer', marginBottom: 16 }}
          />

          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button
              type="button"
              style={btnGhost}
              disabled={index === 0}
              onClick={() => {
                if (index === 0) return;
                setSlides((prev) => {
                  const next = [...prev];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  return next;
                });
                setIndex(index - 1);
              }}
            >
              <IoArrowUpOutline />
            </button>
            <button
              type="button"
              style={btnGhost}
              disabled={index === slides.length - 1}
              onClick={() => {
                if (index >= slides.length - 1) return;
                setSlides((prev) => {
                  const next = [...prev];
                  [next[index + 1], next[index]] = [next[index], next[index + 1]];
                  return next;
                });
                setIndex(index + 1);
              }}
            >
              <IoArrowDownOutline />
            </button>
            <button
              type="button"
              style={{ ...btnGhost, color: '#DC2626' }}
              disabled={slides.length <= 1}
              onClick={() => void removeSlide(index)}
            >
              <IoTrashOutline />
              삭제
            </button>
          </div>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>디바이스</label>
          {grouped.map(([group, items]) => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', marginBottom: 6 }}>{group}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPresetId(p.id)}
                    style={{
                      ...btnGhost,
                      textAlign: 'left',
                      background: presetId === p.id ? '#EBF1FE' : '#fff',
                      borderColor: presetId === p.id ? '#1B6FF5' : '#E5E7EB',
                    }}
                  >
                    {p.label}
                    <span style={{ float: 'right', color: '#9CA3AF', fontWeight: 600 }}>
                      {p.width}×{p.height}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            className="studio-btn-inline"
            style={{ ...btnPrimary, width: '100%', marginTop: 8 }}
            onClick={() => void exportCurrent()}
            disabled={Boolean(busy)}
          >
            <IoDownloadOutline size={18} />
            이 장 · 선택 규격 내보내기
          </button>
          <button
            type="button"
            style={{ ...btnGhost, width: '100%', marginTop: 8 }}
            onClick={() => void exportAllForPreset(preset)}
            disabled={Boolean(busy)}
          >
            모든 장 · {preset.label} {preset.width}×{preset.height} 내보내기
          </button>
          <button
            type="button"
            style={{ ...btnGhost, width: '100%', marginTop: 8 }}
            onClick={() => void exportAllIosPhones()}
            disabled={Boolean(busy)}
          >
            모든 장 · 아이폰 6.5 / 6.7 / 6.9 내보내기
          </button>
          <p style={{ ...hint, marginTop: 8 }}>
            App Store Connect 아이폰 6.5·6.7·6.9 칸은 1320×2868, 1290×2796, 1260×2736 PNG만 받습니다.
          </p>
        </aside>
      </div>
      {cropping && slide?.imageDataUrl ? (
        <StudioImageCropModal
          key={`${slide.id}-${slide.imageDataUrl.slice(-24)}`}
          imageUrl={slide.imageDataUrl}
          aspect={cropAspect}
          presetId={preset.id}
          onPresetChange={setPresetId}
          initialCrop={slide.imageCrop}
          onApply={applyCrop}
          onCancel={() => setCropping(false)}
        />
      ) : null}
    </div>
  );
}
