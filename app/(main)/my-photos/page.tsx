'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { IoCameraOutline, IoTrashOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import OhgoModal, { OhgoModalButton, OhgoModalCancelLink } from '@/components/OhgoModal';
import { resolveAppUser } from '@/lib/auth-session';
import { ohgoConfirm } from '@/lib/ohgo-dialog';
import { isNativeApp, saveImageToDevice } from '@/lib/native-bridge';
import { OhgoPageLoading } from '@/lib/page-styles';
import { getPhotosForUser, type CaptainPhoto } from '@/utils/captain-photo-service';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';

type GalleryItem = {
  photo: CaptainPhoto;
  url: string;
  index: number;
};

function tripParts(iso: string): { month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return { month: Number(match[2]), day: Number(match[3]) };
}

function tripLabel(iso: string): string {
  const parts = tripParts(iso);
  if (!parts) return '조황 사진';
  return `${parts.month}월 ${parts.day}일 조황`;
}

function shortDate(iso: string): string {
  const parts = tripParts(iso);
  if (!parts) return '';
  return `${parts.month}.${parts.day}`;
}

function MyPhotosContent() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState('');
  const [photos, setPhotos] = useState<CaptainPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<GalleryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const loadPhotos = useCallback(async (uuid: string) => {
    setLoading(true);
    try {
      const list = await getPhotosForUser(uuid);
      setPhotos(list);
    } catch (e) {
      console.error(e);
      alert('사진을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      setUserId(appUser.uuid);
      setReady(true);
      await loadPhotos(appUser.uuid);
    };
    void init();
  }, [router, loadPhotos]);

  const onRefresh = useCallback(async () => {
    if (userId) await loadPhotos(userId);
  }, [userId, loadPhotos]);

  useNativePullToRefresh(onRefresh);

  const gallery: GalleryItem[] = photos.flatMap((photo) =>
    photo.imageUrls.map((url, index) => ({ photo, url, index }))
  );

  const saveToGallery = async () => {
    if (!detail || saving) return;
    const filename = `ohgo-${detail.photo.tripDate || 'photo'}-${detail.index + 1}.jpg`;
    setSaving(true);
    try {
      if (isNativeApp()) {
        await saveImageToDevice({ imageUri: detail.url, filename });
        return;
      }
      const response = await fetch(detail.url);
      if (!response.ok) throw new Error('이미지를 불러오지 못했습니다.');
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '갤러리에 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async (photo: CaptainPhoto) => {
    const ok = await ohgoConfirm('내 조황 사진에서 이 사진을 삭제할까요?', '사진 삭제');
    if (!ok) return;
    setDeletingId(photo.id);
    try {
      const res = await fetch('/api/my-photos/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photoId: photo.id }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        alert(body?.message || '삭제하지 못했습니다.');
        return;
      }
      setPhotos((list) => list.filter((item) => item.id !== photo.id));
      if (detail?.photo.id === photo.id) setDetail(null);
    } catch (e) {
      console.error(e);
      alert('삭제하지 못했습니다.');
    } finally {
      setDeletingId('');
    }
  };

  if (!ready) return <OhgoPageLoading />;

  return (
    <SubPageFrame title="내 조황 사진" onRefresh={onRefresh}>
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : gallery.length === 0 ? (
        <EmptyState
          icon={IoCameraOutline}
          message="태깅된 조황 사진이 없습니다"
          subtitle="선장님이 사진에 태깅해 주시면 여기에서 확인할 수 있어요."
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 3,
          }}
        >
          {gallery.map((item) => {
            const date = shortDate(item.photo.tripDate);
            const busy = deletingId === item.photo.id;
            return (
              <div
                key={`${item.photo.id}-${item.index}`}
                style={{
                  position: 'relative',
                  borderRadius: 8,
                  overflow: 'hidden',
                  backgroundColor: '#F2F3F5',
                }}
              >
                <button
                  type="button"
                  onClick={() => setDetail(item)}
                  aria-label={date ? `${date} 조황 사진 보기` : '조황 사진 보기'}
                  style={{
                    padding: 0,
                    border: 'none',
                    width: '100%',
                    cursor: 'pointer',
                    background: 'none',
                    display: 'block',
                  }}
                >
                  <img
                    src={item.url}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                  />
                </button>
                {date && (
                  <span
                    style={{
                      position: 'absolute',
                      left: 6,
                      bottom: 6,
                      padding: '2px 6px',
                      borderRadius: 999,
                      backgroundColor: 'rgba(0, 0, 0, 0.55)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      lineHeight: 1.4,
                      pointerEvents: 'none',
                    }}
                  >
                    {date}
                  </span>
                )}
                <button
                  type="button"
                  aria-label="삭제"
                  disabled={busy}
                  onClick={() => void removePhoto(item.photo)}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 28,
                    height: 28,
                    padding: 0,
                    border: 'none',
                    borderRadius: 999,
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  <IoTrashOutline size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <OhgoModal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? tripLabel(detail.photo.tripDate) : '조황 사진'}
        size="lg"
        footer={
          <>
            <OhgoModalButton onClick={() => void saveToGallery()} disabled={saving}>
              {saving ? '저장 중...' : '갤러리로 저장'}
            </OhgoModalButton>
            <OhgoModalCancelLink onClick={() => setDetail(null)}>닫기</OhgoModalCancelLink>
          </>
        }
      >
        {detail && (
          <img
            src={detail.url}
            alt=""
            style={{ width: '100%', borderRadius: 12, display: 'block' }}
          />
        )}
      </OhgoModal>
    </SubPageFrame>
  );
}

export default function MyPhotosPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <MyPhotosContent />
    </Suspense>
  );
}
