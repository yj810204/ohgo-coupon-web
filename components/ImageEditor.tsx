'use client';

import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import {
  IoCheckmarkOutline,
  IoCloseOutline,
  IoRefreshOutline,
} from 'react-icons/io5';
import { canvasToCompressedFile } from '@/lib/image-process';
import {
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_FONT,
} from '@/lib/page-styles';

type AspectOption = '4:3' | '1:1' | '3:4';

const ASPECT_MAP: Record<AspectOption, number> = {
  '4:3': 4 / 3,
  '1:1': 1,
  '3:4': 3 / 4,
};

interface ImageEditorProps {
  imageUrl: string;
  onSave: (editedFile: File) => void | Promise<void>;
  onCancel: () => void;
  /** 기본 비율 (기본 4:3) */
  defaultAspect?: AspectOption;
  title?: string;
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    // object URL / data URL은 CORS 이슈 없음
    image.src = url;
  });
}

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

async function getCroppedCanvas(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0
): Promise<HTMLCanvasElement> {
  const image = await createImage(imageSrc);
  const rotRad = getRadianAngle(rotation);
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  canvas.width = Math.max(1, Math.round(bBoxWidth));
  canvas.height = Math.max(1, Math.round(bBoxHeight));

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const cropped = document.createElement('canvas');
  const croppedCtx = cropped.getContext('2d');
  if (!croppedCtx) throw new Error('No 2d context');

  const w = Math.max(1, Math.round(pixelCrop.width));
  const h = Math.max(1, Math.round(pixelCrop.height));
  cropped.width = w;
  cropped.height = h;
  croppedCtx.drawImage(canvas, pixelCrop.x, pixelCrop.y, w, h, 0, 0, w, h);
  return cropped;
}

export default function ImageEditor({
  imageUrl,
  onSave,
  onCancel,
  defaultAspect = '4:3',
  title = '이미지 편집',
}: ImageEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspectKey, setAspectKey] = useState<AspectOption>(defaultAspect);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels || saving) return;
    setSaving(true);
    try {
      const croppedCanvas = await getCroppedCanvas(imageUrl, croppedAreaPixels, rotation);
      const file = await canvasToCompressedFile(croppedCanvas, {
        maxEdge: 1600,
        quality: 0.82,
        fileName: `edited-${Date.now()}.jpg`,
      });
      await onSave(file);
    } catch (error) {
      console.error('Error cropping image:', error);
      alert('이미지 편집 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-end justify-content-center"
      style={{ zIndex: 'var(--ohgo-modal-zindex, 20000)', backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={saving ? undefined : onCancel}
    >
      <div
        className="bg-white w-100 d-flex flex-column"
        style={{
          maxWidth: 480,
          maxHeight: '92vh',
          borderRadius: '20px 20px 0 0',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="d-flex justify-content-between align-items-center px-3 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid #F7F8FA' }}
        >
          <h5 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: OHGO_FONT, color: '#1A1D1F' }}>
            {title}
          </h5>
          <button
            type="button"
            className="btn btn-link p-0"
            onClick={onCancel}
            disabled={saving}
            aria-label="닫기"
            style={{ color: '#6F767E' }}
          >
            <IoCloseOutline size={24} />
          </button>
        </div>

        <div className="position-relative flex-shrink-0" style={{ width: '100%', height: 'min(52vh, 360px)', backgroundColor: '#111' }}>
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={ASPECT_MAP[aspectKey]}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            objectFit="contain"
          />
        </div>

        <div className="px-3 pt-3 pb-2 flex-shrink-0" style={{ overflowY: 'auto' }}>
          <div className="d-flex gap-2 mb-3 flex-wrap">
            {([
              ['4:3', '4:3'],
              ['1:1', '1:1'],
              ['3:4', '3:4'],
            ] as const).map(([key, label]) => {
              const active = aspectKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  className="btn"
                  disabled={saving}
                  onClick={() => setAspectKey(key)}
                  style={{
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: OHGO_FONT,
                    border: 'none',
                    backgroundColor: active ? '#EBF1FE' : '#F7F8FA',
                    color: active ? '#1B6FF5' : '#6F767E',
                  }}
                >
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              className="btn d-flex align-items-center gap-1"
              disabled={saving}
              onClick={() => setRotation((r) => (r + 90) % 360)}
              style={{
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: OHGO_FONT,
                border: 'none',
                backgroundColor: '#F7F8FA',
                color: '#6F767E',
              }}
            >
              <IoRefreshOutline size={14} />
              90°
            </button>
          </div>

          <div className="d-flex gap-2 pb-3">
            <button
              type="button"
              className={`btn flex-fill ${OHGO_DISMISS_BTN_CLASS}`}
              style={{ ...OHGO_DISMISS_BTN, padding: '12px 16px' }}
              onClick={onCancel}
              disabled={saving}
            >
              취소
            </button>
            <button
              type="button"
              className={`btn flex-fill d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
              style={{ ...OHGO_CONFIRM_BTN, padding: '12px 16px', opacity: saving ? 0.7 : 1 }}
              onClick={() => void handleSave()}
              disabled={saving || !croppedAreaPixels}
            >
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status" />
                  처리 중...
                </>
              ) : (
                <>
                  <IoCheckmarkOutline size={18} />
                  적용
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
