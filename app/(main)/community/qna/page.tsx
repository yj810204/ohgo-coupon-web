'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import { getPhotos, CommunityPhoto, COMMUNITY_POST_DELETED_MESSAGE, sortBoardList } from '@/utils/community-service';
import { categoryLabel, getBoardCategories, type BoardCategory } from '@/utils/board-category-service';
import { IoHelpCircleOutline, IoCreateOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import QnaListItem from '@/components/community/QnaListItem';
import CategoryChipRow from '@/components/community/CategoryChipRow';
import { displayMemberName, formatPhotoCardDate } from '@/lib/mask-member-name';
import { useNavigation } from '@/hooks/useNavigation';
import { OHGO_CONFIRM_BTN, OHGO_CONFIRM_BTN_CLASS, OHGO_FONT } from '@/lib/page-styles';

function QnaPageContent() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const [posts, setPosts] = useState<CommunityPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [canSeeFullNames, setCanSeeFullNames] = useState(false);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');

  useEffect(() => {
    const checkAuth = async () => {
      const user = await resolveAppUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      setCanSeeFullNames(Boolean(user.isAdmin || user.isCaptain));
      await loadPosts();
    };
    void checkAuth();
  }, [router]);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const [list, cats] = await Promise.all([
        getPhotos(undefined, 'qna'),
        getBoardCategories('qna', { includeInactive: true }),
      ]);
      setPosts(list);
      setCategories(cats);
    } catch (err) {
      console.error(err);
      alert('게시글을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const visibleCategories = categories.filter((item) => item.isActive);
  const filteredPosts = sortBoardList(
    categoryFilter === 'all' ? posts : posts.filter((post) => post.category === categoryFilter)
  );

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <SubPageFrame title="낚시 Q&A" onRefresh={loadPosts} onBack={() => router.replace('/community')}>
      {visibleCategories.length > 0 ? (
        <div className="mb-3">
          <CategoryChipRow
            categories={visibleCategories}
            value={categoryFilter}
            onChange={setCategoryFilter}
            collapsible
          />
        </div>
      ) : null}

      <div className="d-flex align-items-center justify-content-between mb-2" style={{ paddingInline: 2 }}>
        <span style={{ fontSize: 13, color: '#8A9199', fontFamily: OHGO_FONT, fontWeight: 600 }}>
          질문 {filteredPosts.length}개
        </span>
      </div>

      {filteredPosts.length === 0 ? (
        <EmptyState
          icon={IoHelpCircleOutline}
          message="아직 등록된 질문이 없습니다."
          subtitle="첫 질문을 남겨보세요."
          style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        />
      ) : (
        <div className="d-flex flex-column" style={{ gap: 12 }}>
          {filteredPosts.map((post) => (
            <QnaListItem
              key={post.photoId}
              badge="Q"
              commentLabel="답변"
              accepted={Boolean(post.acceptedCommentId)}
              categoryLabel={categoryLabel('qna', post.category, categories)}
              title={
                post.isDeleted
                  ? COMMUNITY_POST_DELETED_MESSAGE
                  : post.title?.trim() || '제목 없음'
              }
              excerpt={post.isDeleted ? undefined : post.description?.trim()}
              imageUrl={post.imageUrls?.[0] || post.imageUrl || undefined}
              author={displayMemberName(post.uploadedByName, canSeeFullNames)}
              date={formatPhotoCardDate(post.uploadedAt)}
              commentCount={post.commentCount}
              isDeleted={post.isDeleted}
              notice={Boolean(post.isNotice)}
              onClick={() => navigate(`/community/${post.photoId}`)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => router.push('/community/qna/write')}
        className={`btn w-100 fw-semibold d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
        style={{ ...OHGO_CONFIRM_BTN, marginTop: 16 }}
      >
        <IoCreateOutline size={18} />
        질문하기
      </button>
    </SubPageFrame>
  );
}

export default function QnaPage() {
  return (
    <Suspense
      fallback={
        <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
          <div className="spinner-border text-primary" />
        </div>
      }
    >
      <QnaPageContent />
    </Suspense>
  );
}
