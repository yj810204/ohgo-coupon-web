'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { IoCloseOutline, IoDownloadOutline, IoCheckmarkCircleOutline } from 'react-icons/io5';
import {
  finalizeConfirmedTrip,
  getAttendance,
  isTripConfirmed,
  saveConfirmedTripMembers,
} from '@/utils/roster-service';
import { loadRosterPreviewImage } from '@/lib/roster-preview-image';
import { uploadRosterImage } from '@/lib/roster-upload';
import OhgoModal, { OhgoModalButton, OhgoModalCancelLink } from '@/components/OhgoModal';
import { isNativeApp, saveImageToDevice } from '@/lib/native-bridge';
import {
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_FONT,
  OhgoPageLoading,
} from '@/lib/page-styles';

const MIN_SCALE = 1;
const MAX_SCALE = 5;

const HEADER_BTN: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 1000,
  border: 'none',
  backgroundColor: 'rgba(255,255,255,0.14)',
  color: '#FFFFFF',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  fontFamily: OHGO_FONT,
};

function touchDistance(a: Touch, b: Touch) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function touchMidpoint(a: Touch, b: Touch) {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

function RosterPreviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const imageUriParam = searchParams.get('imageUri');
  const isLocalPreview = searchParams.get('local') === '1';
  const date = searchParams.get('date');
  const tripNumber = searchParams.get('tripNumber');

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  /** 핀치 시작 시: 두 손가락 사이 이미지 좌표를 고정해 두고, 이동 중 중점 아래로 유지 */
  const pinchRef = useRef<{
    distance: number;
    scale: number;
    contentX: number;
    contentY: number;
  } | null>(null);
  const lastTapRef = useRef(0);

  const isZoomed = scale > 1.01;

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    const checkConfirmationStatus = async () => {
      if (!date || !tripNumber) return;
      try {
        const tripNum = parseInt(tripNumber, 10);
        if (await isTripConfirmed(date, tripNum)) {
          setIsConfirmed(true);
        }
      } catch (error) {
        console.error('Error checking confirmation status:', error);
      }
    };
    void checkConfirmationStatus();
  }, [date, tripNumber]);

  useEffect(() => {
    const localImage = isLocalPreview ? loadRosterPreviewImage() : null;
    const next = localImage || imageUriParam;
    if (!next) {
      setLoading(false);
      setImageError(true);
      return;
    }
    setImageUri(next);
    setImageError(false);
    setLoading(true);
  }, [isLocalPreview, imageUriParam]);

  /** 이미지 중심 기준 좌표계에서, 포커스 지점(client)이 고정되도록 확대 */
  const applyZoomAt = useCallback((newScale: number, clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    const prev = scaleRef.current;
    if (Math.abs(clamped - prev) < 0.0001) return;

    if (clamped <= MIN_SCALE) {
      scaleRef.current = MIN_SCALE;
      positionRef.current = { x: 0, y: 0 };
      setScale(MIN_SCALE);
      setPosition({ x: 0, y: 0 });
      return;
    }

    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const fx = clientX - rect.left;
    const fy = clientY - rect.top;
    const pos = positionRef.current;
    // 화면점 → 이미지 중심 기준 콘텐츠 좌표
    const contentX = (fx - cx - pos.x) / prev;
    const contentY = (fy - cy - pos.y) / prev;
    // 같은 콘텐츠 점이 같은 화면점에 오도록 position 재계산
    const nextPos = {
      x: fx - cx - contentX * clamped,
      y: fy - cy - contentY * clamped,
    };

    scaleRef.current = clamped;
    positionRef.current = nextPos;
    setScale(clamped);
    setPosition(nextPos);
  }, []);

  const resetZoom = useCallback(() => {
    scaleRef.current = 1;
    positionRef.current = { x: 0, y: 0 };
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
  }, []);

  const handleImageLoad = () => {
    setLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setLoading(false);
    setImageError(true);
  };

  // wheel은 React onWheel이 passive라 preventDefault가 안 먹음 → native listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.12 : 0.12;
      applyZoomAt(scaleRef.current + delta, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoomAt]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scaleRef.current <= MIN_SCALE) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scaleRef.current <= MIN_SCALE) return;
    const next = { x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y };
    positionRef.current = next;
    setPosition(next);
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const el = containerRef.current;
      if (!el) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      const mid = touchMidpoint(a, b);
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const fx = mid.x - rect.left;
      const fy = mid.y - rect.top;
      const s = scaleRef.current;
      const pos = positionRef.current;
      pinchRef.current = {
        distance: Math.max(1, touchDistance(a, b)),
        scale: s,
        // 핀치 시작 중점 아래의 이미지 콘텐츠 좌표 (이후 확대 기준점)
        contentX: (fx - cx - pos.x) / s,
        contentY: (fy - cy - pos.y) / s,
      };
      setIsDragging(false);
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        // 더블탭: 탭 위치 기준 확대 ↔ 원래대로
        if (scaleRef.current > MIN_SCALE) {
          resetZoom();
        } else {
          applyZoomAt(2.5, t.clientX, t.clientY);
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (scaleRef.current > MIN_SCALE) {
        setIsDragging(true);
        dragStartRef.current = {
          x: t.clientX - positionRef.current.x,
          y: t.clientY - positionRef.current.y,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.max(1, touchDistance(a, b));
      const nextScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, pinchRef.current.scale * (dist / pinchRef.current.distance))
      );

      if (nextScale <= MIN_SCALE) {
        scaleRef.current = MIN_SCALE;
        positionRef.current = { x: 0, y: 0 };
        setScale(MIN_SCALE);
        setPosition({ x: 0, y: 0 });
        return;
      }

      // 현재 두 손가락 중점 아래에, 시작 때 잡은 콘텐츠 점이 오도록 배치
      const mid = touchMidpoint(a, b);
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const fx = mid.x - rect.left;
      const fy = mid.y - rect.top;
      const nextPos = {
        x: fx - cx - pinchRef.current.contentX * nextScale,
        y: fy - cy - pinchRef.current.contentY * nextScale,
      };
      scaleRef.current = nextScale;
      positionRef.current = nextPos;
      setScale(nextScale);
      setPosition(nextPos);
      return;
    }

    if (e.touches.length === 1 && isDragging && scaleRef.current > MIN_SCALE) {
      e.preventDefault();
      const t = e.touches[0];
      const next = {
        x: t.clientX - dragStartRef.current.x,
        y: t.clientY - dragStartRef.current.y,
      };
      positionRef.current = next;
      setPosition(next);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) setIsDragging(false);
  };

  const handleDownload = async () => {
    if (!imageUri || downloading) return;
    const filename = `${date || 'roster'}_${tripNumber || '0'}항차_명부.jpg`;

    try {
      setDownloading(true);

      // WebView에서는 <a download>가 동작하지 않음 → 네이티브 앨범 저장
      if (isNativeApp()) {
        await saveImageToDevice({ imageUri, filename });
        // 성공/실패 알림은 네이티브 Alert로 표시
        return;
      }

      const response = await fetch(imageUri);
      if (!response.ok) throw new Error('fetch failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading image:', error);
      if (!isNativeApp()) {
        alert('이미지 다운로드 중 오류가 발생했습니다.');
      }
    } finally {
      setDownloading(false);
    }
  };

  const confirmDeparture = async () => {
    if (!date || !tripNumber || !imageUri) {
      alert('날짜 또는 항차 정보가 없습니다.');
      return;
    }

    try {
      setSavingImage(true);
      const response = await fetch(imageUri);
      if (!response.ok) throw new Error('이미지를 불러오지 못했습니다.');
      const blob = await response.blob();
      const tripNum = parseInt(tripNumber, 10);
      const uploaded = await uploadRosterImage(blob, date, tripNum);
      const attendance = await getAttendance(date);
      if (attendance.memberIds.length > 0) {
        await saveConfirmedTripMembers(date, tripNum, attendance.memberIds);
      }
      await finalizeConfirmedTrip(date, tripNum, uploaded.imagePath, uploaded.imageUrl);

      const filename = `${date || 'roster'}_${tripNumber || '0'}항차_명부.jpg`;
      let savedLocally = true;
      try {
        if (isNativeApp()) {
          await saveImageToDevice({ imageUri, filename });
        } else {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(link);
        }
      } catch (error) {
        savedLocally = false;
        console.error('Error saving roster image locally:', error);
      }

      setConfirmOpen(false);
      alert(
        savedLocally
          ? '출항이 확정되었습니다. 승선명부 이미지가 서버와 기기에 저장되었습니다.'
          : '출항은 확정되었습니다. 기기 저장만 실패했으니 미리보기에서 다시 저장해 주세요.'
      );
      router.push('/today-roster');
    } catch (error) {
      console.error('Error in confirmDeparture:', error);
      const detail = error instanceof Error && error.message ? error.message : '';
      alert(detail ? `출항 확정에 실패했습니다. ${detail}` : '출항 확정 정보를 저장하는 중 오류가 발생했습니다.');
    } finally {
      setSavingImage(false);
    }
  };

  const titleMeta = [date, tripNumber ? `${tripNumber}항차` : null].filter(Boolean).join(' · ');

  return (
    <div
      className="min-vh-100 d-flex flex-column position-relative"
      style={{ backgroundColor: '#1A1D1F', overflow: 'hidden', fontFamily: OHGO_FONT }}
    >
      {/* Header — 앱 셸 폭 */}
      <div
        className="position-absolute top-0 start-0 end-0"
        style={{ zIndex: 10, backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        <div
          className="d-flex align-items-center justify-content-between px-3"
          style={{
            maxWidth: 'var(--ohgo-app-max-width)',
            margin: '0 auto',
            minHeight: 56,
            gap: 12,
          }}
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={() => router.back()}
            style={HEADER_BTN}
          >
            <IoCloseOutline size={22} />
          </button>
          <div className="text-center min-w-0 flex-grow-1">
            <div
              style={{
                color: '#FFFFFF',
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              명부 미리보기
            </div>
            {titleMeta ? (
              <div
                style={{
                  color: 'rgba(255,255,255,0.65)',
                  fontSize: 12,
                  fontWeight: 500,
                  lineHeight: 1.3,
                  marginTop: 2,
                }}
              >
                {titleMeta}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="다운로드"
            onClick={() => void handleDownload()}
            disabled={!imageUri || loading || downloading}
            style={{
              ...HEADER_BTN,
              opacity: !imageUri || loading || downloading ? 0.4 : 1,
            }}
          >
            <IoDownloadOutline size={20} />
          </button>
        </div>
      </div>

      {/* Image stage — 핀치/더블탭/드래그/휠 줌 */}
      <div
        ref={containerRef}
        className="position-relative flex-grow-1"
        style={{
          width: '100%',
          maxWidth: 'var(--ohgo-app-max-width)',
          margin: '0 auto',
          height: '100vh',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : isZoomed ? 'grab' : 'default',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {loading && (
          <div className="position-absolute top-50 start-50 translate-middle d-flex flex-column align-items-center text-white">
            <div className="spinner-border mb-2" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="small mb-0" style={{ opacity: 0.75 }}>
              이미지를 불러오는 중...
            </p>
          </div>
        )}

        {imageError && (
          <div className="position-absolute top-50 start-50 translate-middle text-center px-4 w-100">
            <p className="text-white mb-1" style={{ fontWeight: 700 }}>
              이미지를 불러올 수 없습니다.
            </p>
            <p className="small mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {isLocalPreview
                ? '방금 만든 이미지를 찾을 수 없습니다. 명부를 다시 생성해 주세요.'
                : '이미지 서버에 일시적인 문제가 있을 수 있습니다.'}
            </p>
            <button
              type="button"
              className={`btn w-100 ${OHGO_DISMISS_BTN_CLASS}`}
              style={OHGO_DISMISS_BTN}
              onClick={() => router.back()}
            >
              {isLocalPreview ? '다시 생성' : '돌아가기'}
            </button>
          </div>
        )}

        {imageUri && !imageError && (
          <img
            ref={imageRef}
            src={imageUri}
            alt={`${date} ${tripNumber}항차 명부`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale})`,
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {/* Footer — 앱 셸 폭 */}
      <div
        className="position-absolute bottom-0 start-0 end-0 p-3"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      >
        <div style={{ maxWidth: 'var(--ohgo-app-max-width)', margin: '0 auto' }}>
          {isConfirmed ? (
            <div
              className="d-flex align-items-center justify-content-center gap-2 w-100"
              style={{
                backgroundColor: '#E8F5E9',
                color: '#2E7D32',
                minHeight: 56,
                borderRadius: 1000,
                fontFamily: OHGO_FONT,
                padding: '14px 20px',
              }}
            >
              <IoCheckmarkCircleOutline
                size={22}
                className="flex-shrink-0"
                style={{ color: '#2E7D32' }}
              />
              <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.5 }}>
                출항이 확정되었습니다
              </span>
            </div>
          ) : (
            <button
              type="button"
              className={`btn w-100 d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
              style={{
                ...OHGO_CONFIRM_BTN,
                opacity: savingImage ? 0.65 : 1,
              }}
              onClick={() => setConfirmOpen(true)}
              disabled={savingImage}
            >
              <IoCheckmarkCircleOutline size={20} className="flex-shrink-0" />
              <span>출항 확정</span>
            </button>
          )}
        </div>
      </div>

      <OhgoModal
        open={confirmOpen}
        onClose={() => {
          if (!savingImage) setConfirmOpen(false);
        }}
        title="출항 확정"
        titleTone="brand"
        closeOnBackdrop={!savingImage}
        footer={
          <>
            <OhgoModalButton disabled={savingImage} onClick={() => void confirmDeparture()}>
              {savingImage ? '저장 중...' : '확정'}
            </OhgoModalButton>
            <OhgoModalCancelLink disabled={savingImage} onClick={() => setConfirmOpen(false)} />
          </>
        }
      >
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.55,
            color: '#6F767E',
            fontFamily: OHGO_FONT,
          }}
        >
          출항을 확정하시겠습니까?
          <br />
          확정 후에는 수정이 불가능합니다.
        </p>
      </OhgoModal>
    </div>
  );
}

export default function RosterPreviewPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <RosterPreviewContent />
    </Suspense>
  );
}
