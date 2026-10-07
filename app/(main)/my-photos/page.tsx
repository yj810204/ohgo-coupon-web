'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { format } from 'date-fns';
import { IoCameraOutline, IoTrashOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import OhgoModal, { OhgoModalButton, OhgoModalCancelLink } from '@/components/OhgoModal';
import { resolveAppUser } from '@/lib/auth-session';
import { shareCatchByEmail, shareCatchBySms, shareCatchToKakao } from '@/lib/catch-share';
import { ohgoConfirm } from '@/lib/ohgo-dialog';
import { OHGO_FONT, OhgoPageLoading } from '@/lib/page-styles';
import { getPhotosForUser, type CaptainPhoto } from '@/utils/captain-photo-service';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';

const FONT = OHGO_FONT;

function tripLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${Number(match[2])}월 ${Number(match[3])}일 조황`;
}

function registeredLabel(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'M월 d일 HH:mm');
}

function MyPhotosContent() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState('');
  const [photos, setPhotos] = useState<CaptainPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CaptainPhoto | null>(null);
  const [detailIndex, setDetailIndex] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
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

  const openDetail = (photo: CaptainPhoto, index = 0) => {
    setShareOpen(false);
    setDetail(photo);
    setDetailIndex(index);
  };

  const closeDetail = () => {
    setShareOpen(false);
    setDetail(null);
  };

  const shareInput = () => {
    if (!detail) return null;
    const imageUrl = detail.imageUrls[detailIndex];
    if (!imageUrl) return null;
    const title = `오고피씽 ${tripLabel(detail.tripDate)}`;
    const text = detail.species ? `${title} · ${detail.species}` : title;
    return { title, text, imageUrl };
  };

  const runShare = async (kind: 'kakao' | 'sms' | 'email') => {
    const input = shareInput();
    if (!input) return;
    try {
      if (kind === 'kakao') await shareCatchToKakao(input);
      else if (kind === 'sms') shareCatchBySms(input);
      else shareCatchByEmail(input);
    } catch (e) {
      console.error(e);
      alert('공유에 실패했습니다.');
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
      if (detail?.id === photo.id) closeDetail();
    } catch (e) {
      console.error(e);
      alert('삭제하지 못했습니다.');
    } finally {
      setDeletingId('');
    }
  };

  if (!ready) return <OhgoPageLoading />;

  const shareButtonStyle: React.CSSProperties = {
    border: 'none',
    borderRadius: 12,
    backgroundColor: '#EBF1FE',
    color: '#1B6FF5',
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: 700,
    padding: '12px 8px',
  };

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
          {photos.map((photo) => {
            const registered = registeredLabel(photo.createdAt);
            return (
              <div
                key={photo.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  padding: 12,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                }}
              >
                <div className="d-flex align-items-start justify-content-between gap-2" style={{ marginBottom: 10 }}>
                  <div className="min-w-0">
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: FONT, color: '#1A1D1F', lineHeight: 1.35 }}>
                      {tripLabel(photo.tripDate)}
                    </div>
                    <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 4, lineHeight: 1.4 }}>
                      {photo.species ? photo.species : '조황 사진'}
                      {registered ? ` · ${registered}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removePhoto(photo)}
                    disabled={deletingId === photo.id}
                    aria-label="내 조황 사진에서 삭제"
                    className="btn p-0 d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                    style={{
                      width: 36,
                      height: 36,
                      backgroundColor: '#FFF0F0',
                      border: 'none',
                      opacity: deletingId === photo.id ? 0.5 : 1,
                    }}
                  >
                    <IoTrashOutline size={18} color="#FF3B30" />
                  </button>
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
            );
          })}
        </div>
      )}

      <OhgoModal
        open={Boolean(detail)}
        onClose={closeDetail}
        title={detail ? tripLabel(detail.tripDate) : '조황 사진'}
        size="lg"
        footer={
          <>
            <OhgoModalButton onClick={() => setShareOpen((open) => !open)}>
              공유하기
            </OhgoModalButton>
            <OhgoModalCancelLink onClick={closeDetail}>닫기</OhgoModalCancelLink>
          </>
        }
      >
        {detail && detail.imageUrls[detailIndex] && (
          <>
            <img
              src={detail.imageUrls[detailIndex]}
              alt=""
              style={{ width: '100%', borderRadius: 12, display: 'block' }}
            />
            {shareOpen && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button type="button" style={shareButtonStyle} onClick={() => void runShare('kakao')}>
                  카카오톡
                </button>
                <button type="button" style={shareButtonStyle} onClick={() => runShare('sms')}>
                  문자
                </button>
                <button type="button" style={shareButtonStyle} onClick={() => runShare('email')}>
                  이메일
                </button>
              </div>
            )}
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
