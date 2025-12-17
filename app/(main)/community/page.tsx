'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import { getUser } from '@/lib/storage';
import { getPhotos, CommunityPhoto } from '@/utils/community-service';
import { IoChatbubblesOutline, IoImageOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';

function CommunityPageContent() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      loadPhotos();
    };
    checkAuth();
  }, [router]);

  const loadPhotos = async () => {
    try {
      setLoading(true);
      const photosList = await getPhotos();
      setPhotos(photosList);
    } catch (error) {
      console.error('Error loading photos:', error);
      alert('사진을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPhotos();
    setRefreshing(false);
  };

  const formatDate = (date: Date | Timestamp | undefined): string => {
    if (!date) return '';
    const d = date instanceof Date ? date : date.toDate();
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  };

  if (loading) {
    return (
      <div className="min-vh-100 bg-light">
        <PageHeader title="커뮤니티" />
        <div className="container">
          <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '50vh' }}>
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">로딩 중...</span>
              </div>
              <p className="text-muted">사진을 불러오는 중...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <PageHeader title="커뮤니티" />
      <div className="container">
        {photos.length === 0 ? (
          <div className="d-flex flex-column align-items-center justify-content-center py-5" style={{ minHeight: '50vh' }}>
            <IoImageOutline size={64} className="text-muted mb-3" />
            <p className="text-muted mb-0">아직 등록된 사진이 없습니다.</p>
          </div>
        ) : (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0">조황사진</h5>
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" />
                    새로고침
                  </>
                ) : (
                  '새로고침'
                )}
              </button>
            </div>

            <div className="row g-3">
              {photos.map((photo) => (
                <div key={photo.photoId} className="col-6 col-md-4 col-lg-3">
                  <div
                    className="card shadow-sm"
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/community/${photo.photoId}`)}
                  >
                    <div style={{ position: 'relative', paddingTop: '100%', overflow: 'hidden' }}>
                      <img
                        src={photo.imageUrl}
                        alt={photo.title || '조황사진'}
                        className="card-img-top"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                        loading="lazy"
                      />
                      {photo.commentCount > 0 && (
                        <div
                          className="position-absolute bottom-0 end-0 m-2"
                          style={{
                            backgroundColor: 'rgba(0, 0, 0, 0.6)',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <IoChatbubblesOutline size={14} />
                          {photo.commentCount}
                        </div>
                      )}
                    </div>
                    <div className="card-body p-2">
                      {photo.title && (
                        <h6 className="card-title mb-1" style={{ fontSize: '14px' }}>
                          {photo.title}
                        </h6>
                      )}
                      <p className="card-text mb-0" style={{ fontSize: '12px', color: '#666' }}>
                        {formatDate(photo.uploadedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CommunityPage() {
  return (
    <Suspense fallback={
      <div className="d-flex min-vh-100 align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">로딩 중...</span>
          </div>
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    }>
      <CommunityPageContent />
    </Suspense>
  );
}

