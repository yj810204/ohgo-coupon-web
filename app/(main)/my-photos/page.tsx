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
import { OHGO_FONT, OhgoPageLoading } from '@/lib/page-styles';
import { getPhotosForUser, type CaptainPhoto } from '@/utils/captain-photo-service';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';

const FONT = OHGO_FONT;

type GalleryItem = {
  photo: CaptainPhoto;
  url: string;
  index: number;
};

function tripLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return '조황 사진';
  return `${Number(match[2])}월 ${Number(match[3])}일 조황`;
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
          {gallery.map((item) => (
            <button
              key={`${item.photo.id}-${item.index}`}
              type="button"
              onClick={() => setDetail(item)}
              aria-label="조황 사진 보기"
              style={{
                padding: 0,
                border: 'none',
                borderRadius: 8,
                overflow: 'hidden',
                cursor: 'pointer',
                backgroundColor: '#F2F3F5',
              }}
            >
              <img
                src={item.url}
                alt=""
                loading="lazy"
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}

      <OhgoModal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? tripLabel(detail.photo.tripDate) : '조황 사진'}
        size="lg"
        footer={
          <>
            <OhgoModalButton onClick={() => void saveToGallery()} disabled={saving || deletingId !== ''}>
              {saving ? '저장 중...' : '갤러리로 저장'}
            </OhgoModalButton>
            <button
              type="button"
              onClick={() => detail && void removePhoto(detail.photo)}
              disabled={!detail || deletingId === detail.photo.id}
              style={{
                border: 'none',
                background: 'none',
                color: '#FF3B30',
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 600,
                padding: '8px 0 0',
              }}
            >
              <IoTrashOutline size={16} style={{ marginRight: 4, verticalAlign: -2 }} />
              삭제
            </button>
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
