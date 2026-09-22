'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { format } from 'date-fns';
import { IoCameraOutline, IoShareOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import OhgoModal, { OhgoModalButton, OhgoModalCancelLink } from '@/components/OhgoModal';
import { resolveAppUser } from '@/lib/auth-session';
import { isNativeApp, postToNative } from '@/lib/native-bridge';
import { OHGO_FONT, OhgoPageLoading } from '@/lib/page-styles';
import { getPhotosForUser, type CaptainPhoto } from '@/utils/captain-photo-service';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';

const FONT = OHGO_FONT;

function MyPhotosContent() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState('');
  const [photos, setPhotos] = useState<CaptainPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CaptainPhoto | null>(null);
  const [detailIndex, setDetailIndex] = useState(0);
  const [sharing, setSharing] = useState(false);

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

  const openDetail = (photo: CaptainPhoto, index = 0) => {
    setDetail(photo);
    setDetailIndex(index);
  };

  const shareCurrent = async () => {
    if (!detail) return;
    const url = detail.imageUrls[detailIndex];
    if (!url) return;

    const text = `오고피씽 ${detail.tripDate} 조황${detail.species ? ` · ${detail.species}` : ''}`;

    setSharing(true);
    try {
      if (isNativeApp()) {
        postToNative('SHARE', { url, text });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: '오고피씽 조황', text, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        alert('사진 링크가 복사되었습니다.');
      } else {
        alert('공유 기능을 사용할 수 없습니다.');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        console.error(e);
        alert('공유에 실패했습니다.');
      }
    } finally {
      setSharing(false);
    }
  };

  if (!ready) return <OhgoPageLoading />;

  return (
    <SubPageFrame title="내 조황 사진" onRefresh={onRefresh}>
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : photos.length === 0 ? (
        <EmptyState
          icon={IoCameraOutline}
          message="태깅된 조황 사진이 없습니다"
          subtitle="선장님이 사진에 태깅해 주시면 여기에서 확인할 수 있어요."
        />
      ) : (
        <div className="d-flex flex-column gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                padding: 12,
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT, color: '#1A1D1F' }}>
                {photo.tripDate}
                {photo.species ? ` · ${photo.species}` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', fontFamily: FONT, marginBottom: 10 }}>
                {format(new Date(photo.createdAt), 'yyyy.MM.dd HH:mm')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {photo.imageUrls.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => openDetail(photo, index)}
                    style={{
                      padding: 0,
                      border: 'none',
                      borderRadius: 8,
                      overflow: 'hidden',
                      cursor: 'pointer',
                    }}
                  >
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <OhgoModal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="조황 사진"
        size="lg"
        footer={
          <>
            <OhgoModalButton onClick={() => void shareCurrent()} disabled={sharing}>
              {sharing ? '공유 중...' : '공유하기'}
            </OhgoModalButton>
            <OhgoModalCancelLink onClick={() => setDetail(null)}>닫기</OhgoModalCancelLink>
          </>
        }
      >
        {detail && detail.imageUrls[detailIndex] && (
          <>
            <img
              src={detail.imageUrls[detailIndex]}
              alt=""
              style={{ width: '100%', borderRadius: 12, marginBottom: 12 }}
            />
            <button
              type="button"
              className="btn btn-outline-primary w-100 d-flex align-items-center justify-content-center gap-2"
              style={{ fontFamily: FONT, borderRadius: 10 }}
              onClick={() => void shareCurrent()}
              disabled={sharing}
            >
              <IoShareOutline size={18} />
              SNS 공유
            </button>
          </>
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
