'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import { getPhotos, CommunityPhoto, COMMUNITY_POST_DELETED_MESSAGE } from '@/utils/community-service';
import { IoImageOutline, IoAddOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import CommunityPhotoCard from '@/components/community/CommunityPhotoCard';
import { displayMemberName, formatPhotoCardDate } from '@/lib/mask-member-name';
import { useNavigation } from '@/hooks/useNavigation';
import { communityPageHeaderAction } from '@/lib/page-header-action';

const FONT = "var(--font-ohgo), sans-serif";

function PhotosPageContent() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [canSeeFullNames, setCanSeeFullNames] = useState(false);
  const [user, setUser] = useState<{ uuid: string; isAdmin?: boolean } | null>(null);
  useEffect(() => {
    const checkAuth = async () => {
      const appUser = await resolveAppUser();
      if (!appUser?.uuid) { router.replace('/login'); return; }
      setUser({ uuid: appUser.uuid, isAdmin: appUser.isAdmin });
      setCanSeeFullNames(Boolean(appUser.isAdmin || appUser.isCaptain));
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

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <SubPageFrame
      title="조황 사진"
      onRefresh={loadPhotos}
      onBack={() => router.replace('/community')}
      headerAction={communityPageHeaderAction({
        board: 'photo',
        user,
        onNavigate: (path) => router.push(path),
      })}
    >
        {/* 툴바 */}
        <div className="d-flex align-items-center justify-content-between mb-3">
          <span style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT }}>
            총 {photos.length}개
          </span>
          <button
            type="button"
            onClick={() => router.push('/community/photos/upload')}
            className="btn d-flex align-items-center gap-1"
            style={{ backgroundColor: '#1B6FF5', borderRadius: 10, border: 'none', padding: '7px 14px', fontSize: 13, color: '#fff', fontFamily: FONT, fontWeight: 600 }}
          >
            <IoAddOutline size={15} />
            등록
          </button>
        </div>

        {/* 사진 그리드 */}
        {photos.length === 0 ? (
          <EmptyState
            icon={IoImageOutline}
            message="아직 등록된 사진이 없습니다."
            style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          />
        ) : (
          <div className="row g-2">
            {photos.map((photo) => (
              <div key={photo.photoId} className="col-6">
                <CommunityPhotoCard
                  title={
                    photo.isDeleted
                      ? COMMUNITY_POST_DELETED_MESSAGE
                      : photo.title?.trim() || '조황 사진'
                  }
                  imageUrl={photo.imageUrls?.[0] || photo.imageUrl}
                  author={displayMemberName(photo.uploadedByName, canSeeFullNames)}
                  date={formatPhotoCardDate(photo.uploadedAt)}
                  commentCount={photo.commentCount}
                  isDeleted={photo.isDeleted}
                  isNotice={Boolean(photo.isNotice)}
                  onClick={() => navigate(`/community/${photo.photoId}`)}
                />
              </div>
            ))}
          </div>
        )}
    </SubPageFrame>
  );
}

export default function PhotosPage() {
  return (
    <Suspense fallback={<div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}><div className="spinner-border text-primary" /></div>}>
      <PhotosPageContent />
    </Suspense>
  );
}
