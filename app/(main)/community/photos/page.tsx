'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import { getUser } from '@/lib/storage';
import { getPhotos, CommunityPhoto } from '@/utils/community-service';
import { IoChatbubblesOutline, IoImageOutline, IoAddOutline, IoRefreshOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";

function PhotosPageContent() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) { router.replace('/login'); return; }
      loadPhotos();
    };
    checkAuth();
  }, [router]);

  const loadPhotos = async () => {
    try {
      setLoading(true);
      const list = await getPhotos();
      setPhotos(list);
    } catch (err) {
      console.error(err);
      alert('사진을 불러오는 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPhotos();
    setRefreshing(false);
  };

  const formatDate = (date: Date | Timestamp | string | undefined): string => {
    if (!date) return '';
    let d: Date;
    if (date instanceof Timestamp) d = date.toDate();
    else if (typeof date === 'string') d = new Date(date);
    else d = date;
    return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(d);
  };

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <PageHeader title="조황 사진" />
      <div className="container py-3" style={{ maxWidth: 480 }}>

        {/* 툴바 */}
        <div className="d-flex align-items-center justify-content-between mb-3">
          <span style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT }}>
            총 {photos.length}개
          </span>
          <div className="d-flex gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn d-flex align-items-center gap-1"
              style={{ backgroundColor: '#F7F8FA', borderRadius: 10, border: 'none', padding: '7px 12px', fontSize: 13, color: '#6F767E', fontFamily: FONT }}
            >
              <IoRefreshOutline size={15} className={refreshing ? 'spin' : ''} />
              새로고침
            </button>
            <button
              type="button"
              onClick={() => navigate('/community/photos/upload')}
              className="btn d-flex align-items-center gap-1"
              style={{ backgroundColor: '#1B6FF5', borderRadius: 10, border: 'none', padding: '7px 14px', fontSize: 13, color: '#fff', fontFamily: FONT, fontWeight: 600 }}
            >
              <IoAddOutline size={15} />
              올리기
            </button>
          </div>
        </div>

        {/* 사진 그리드 */}
        {photos.length === 0 ? (
          <div className="py-5 text-center" style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <IoImageOutline size={56} color="#EFEFEF" />
            <p className="mt-3 mb-0" style={{ color: '#6F767E', fontFamily: FONT }}>아직 등록된 사진이 없습니다.</p>
          </div>
        ) : (
          <div className="row g-2">
            {photos.map(photo => (
              <div key={photo.photoId} className="col-6">
                <button
                  type="button"
                  onClick={() => navigate(`/community/${photo.photoId}`)}
                  className="btn w-100 p-0"
                  style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: '#E0E0E0', border: 'none', position: 'relative', aspectRatio: '1 / 1', display: 'block' }}
                >
                  <img
                    src={photo.imageUrl}
                    alt={photo.title || '조황사진'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                  />
                  {/* 하단 오버레이 */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
                    padding: '20px 10px 8px',
                    textAlign: 'left',
                  }}>
                    {photo.title && (
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: FONT, lineHeight: 1.3, marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {photo.title}
                      </div>
                    )}
                    <div className="d-flex align-items-center justify-content-between">
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontFamily: FONT }}>{formatDate(photo.uploadedAt)}</span>
                      {photo.commentCount > 0 && (
                        <span className="d-flex align-items-center gap-1" style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)' }}>
                          <IoChatbubblesOutline size={12} />
                          {photo.commentCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PhotosPage() {
  return (
    <Suspense fallback={<div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}><div className="spinner-border text-primary" /></div>}>
      <PhotosPageContent />
    </Suspense>
  );
}
