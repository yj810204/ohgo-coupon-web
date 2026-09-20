'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper, { type Area, type MediaSize } from 'react-easy-crop';
import {
  MdAlignHorizontalCenter,
  MdAlignVerticalCenter,
  MdCenterFocusStrong,
  MdFitScreen,
} from 'react-icons/md';
import { IoCheckmarkOutline, IoCloseOutline } from 'react-icons/io5';
import {
  cropFromPercentArea,
  cropFromPixelArea,
  cropToPercentArea,
  STORE_PRESETS,
  type ImageCrop,
} from '@/lib/store-screenshot-studio';

type Props = {
  imageUrl: string;
  aspect: number;
  presetId: string;
  onPresetChange: (id: string) => void;
  initialCrop: ImageCrop | null;
  onApply: (crop: ImageCrop) => void;
  onCancel: () => void;
};

export default function StudioImageCropModal({
  imageUrl,
  aspect,
  presetId,
  onPresetChange,
  initialCrop,
  onApply,
  onCancel,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [cropperKey, setCropperKey] = useState(0);
  const [keepInitial, setKeepInitial] = useState(Boolean(initialCrop));
  const cropRef = useRef(crop);
  const zoomRef = useRef(zoom);
  const percentRef = useRef<Area | null>(null);
  const pixelsRef = useRef<Area | null>(null);
  const mediaRef = useRef<{ naturalWidth: number; naturalHeight: number } | null>(null);
  cropRef.current = crop;
  zoomRef.current = zoom;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      const step = e.shiftKey ? 4 : 1;
      const current = cropRef.current;
      let next: { x: number; y: number } | null = null;
      if (e.key === 'ArrowLeft') next = { x: current.x - step, y: current.y };
      if (e.key === 'ArrowRight') next = { x: current.x + step, y: current.y };
      if (e.key === 'ArrowUp') next = { x: current.x, y: current.y - step };
      if (e.key === 'ArrowDown') next = { x: current.x, y: current.y + step };
      if (!next) return;
      e.preventDefault();
      setKeepInitial(false);
      cropRef.current = next;
      setCrop(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const rememberArea = useCallback((percent: Area, pixels: Area) => {
    if (percent) percentRef.current = percent;
    if (pixels) pixelsRef.current = pixels;
    setArea(pixels ?? percent);
  }, []);

  const onMediaLoaded = useCallback((media: MediaSize) => {
    mediaRef.current = { naturalWidth: media.naturalWidth, naturalHeight: media.naturalHeight };
  }, []);

  const commit = () => {
    const percent = percentRef.current;
    if (percent) {
      const next = cropFromPercentArea(percent);
      if (next) {
        onApply(next);
        return;
      }
    }
    const pixels = pixelsRef.current;
    if (!pixels) return;
    const applyWith = (naturalWidth: number, naturalHeight: number) => {
      const next = cropFromPixelArea(pixels, naturalWidth, naturalHeight);
      if (next) onApply(next);
    };
    const media = mediaRef.current;
    if (media) {
      applyWith(media.naturalWidth, media.naturalHeight);
      return;
    }
    const img = new Image();
    img.onload = () => applyWith(img.naturalWidth, img.naturalHeight);
    img.src = imageUrl;
  };

  const align = (next: { x: number; y: number }) => {
    setKeepInitial(false);
    setCrop(next);
    cropRef.current = next;
    setCropperKey((key) => key + 1);
  };

  const fitToScreen = () => {
    setKeepInitial(false);
    setZoom(1);
    zoomRef.current = 1;
    setCrop({ x: 0, y: 0 });
    cropRef.current = { x: 0, y: 0 };
    setCropperKey((key) => key + 1);
  };

  return (
    <div className="studio-crop-overlay" role="dialog" aria-modal="true" aria-labelledby="studio-crop-title">
      <div className="studio-crop-dialog">
        <div className="studio-crop-head">
          <div>
            <h2 id="studio-crop-title">이미지 편집</h2>
            <label className="studio-device-select studio-device-select--compact">
              디바이스
              <select
                value={presetId}
                onChange={(e) => {
                  setKeepInitial(false);
                  onPresetChange(e.target.value);
                }}
              >
                {STORE_PRESETS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} ({item.width}×{item.height})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="studio-crop-icon-btn" onClick={onCancel} aria-label="닫기">
            <IoCloseOutline size={22} />
          </button>
        </div>

        <div className="studio-crop-stage-wrap">
          <div className="studio-crop-stage" style={{ ['--crop-aspect' as string]: String(aspect) }}>
            <Cropper
              key={`${cropperKey}-${presetId}`}
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={4}
              aspect={aspect}
              showGrid
              objectFit="contain"
              restrictPosition
              roundCropAreaPixels
              initialCroppedAreaPercentages={
                keepInitial && initialCrop ? cropToPercentArea(initialCrop) : undefined
              }
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={rememberArea}
              onCropAreaChange={rememberArea}
              onMediaLoaded={onMediaLoaded}
            />
          </div>
        </div>

        <div className="studio-crop-controls">
          <div className="studio-crop-zoom">
            <span>축소</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="이미지 크기"
            />
            <span>확대</span>
          </div>
          <div className="studio-crop-toolbar">
            <button
              type="button"
              className="studio-crop-tool"
              title="가로 중앙"
              aria-label="가로 중앙"
              onClick={() => align({ x: 0, y: crop.y })}
            >
              <MdAlignHorizontalCenter size={22} />
            </button>
            <button
              type="button"
              className="studio-crop-tool"
              title="세로 중앙"
              aria-label="세로 중앙"
              onClick={() => align({ x: crop.x, y: 0 })}
            >
              <MdAlignVerticalCenter size={22} />
            </button>
            <button
              type="button"
              className="studio-crop-tool is-strong"
              title="정중앙"
              aria-label="정중앙"
              onClick={() => align({ x: 0, y: 0 })}
            >
              <MdCenterFocusStrong size={20} />
            </button>
            <button
              type="button"
              className="studio-crop-tool"
              title="화면에 맞춤"
              aria-label="화면에 맞춤"
              onClick={fitToScreen}
            >
              <MdFitScreen size={20} />
            </button>
            <button
              type="button"
              className="studio-crop-tool"
              title="취소"
              aria-label="취소"
              onClick={onCancel}
            >
              <IoCloseOutline size={20} />
            </button>
            <button
              type="button"
              className="studio-crop-btn primary"
              disabled={!area}
              onClick={commit}
            >
              <IoCheckmarkOutline size={18} />
              적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
