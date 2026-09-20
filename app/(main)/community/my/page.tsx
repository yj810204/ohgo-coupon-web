'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import {
  COMMUNITY_POST_DELETED_MESSAGE,
  getPhotosByUser,
  type CommunityBoardType,
  type CommunityPhoto,
} from '@/utils/community-service';
import { IoCreateOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import QnaListItem from '@/components/community/QnaListItem';
import { formatPhotoCardDate } from '@/lib/mask-member-name';
import { useNavigation } from '@/hooks/useNavigation';
import { OhgoPageLoading } from '@/lib/page-styles';

const FILTERS: { id: 'all' | CommunityBoardType; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'photo', label: '조황 사진' },
  { id: 'faq', label: '팁 · FAQ' },
  { id: 'qna', label: 'Q&A' },
];

function boardLabel(board?: CommunityBoardType): string {
  if (board === 'faq') return '팁 · FAQ';
  if (board === 'qna') return 'Q&A';
  return '조황 사진';
}

export default function MyCommunityPostsPage() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const [posts, setPosts] = useState<CommunityPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | CommunityBoardType>('all');

  const load = useCallback(async (uuid: string) => {
    setLoading(true);
    try {
      setPosts(await getPhotosByUser(uuid));
    } catch (error) {
      console.error(error);
      alert('글을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const user = await resolveAppUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      await load(user.uuid);
    };
    void init();
  }, [router, load]);

  const filtered = useMemo(
    () => (filter === 'all' ? posts : posts.filter((post) => (post.boardType || 'photo') === filter)),
    [posts, filter]
  );

  if (loading) return <OhgoPageLoading />;

  return (
    <SubPageFrame title="내가쓴글" onRefresh={() => resolveAppUser().then((user) => user?.uuid && load(user.uuid))} onBack={() => router.replace('/my-page')}>
      <div className="d-flex gap-2 mb-3 overflow-auto">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className="btn flex-shrink-0"
              style={{
                borderRadius: 999,
                border: 'none',
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 700,
                backgroundColor: active ? '#1B6FF5' : '#F2F3F5',
                color: active ? '#fff' : '#6F767E',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={IoCreateOutline}
          message="작성한 글이 없습니다."
          style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        />
      ) : (
        <div className="d-flex flex-column" style={{ gap: 12 }}>
          {filtered.map((post) => {
            const board = post.boardType || 'photo';
            return (
              <QnaListItem
                key={post.photoId}
                badge={board === 'faq' ? 'TIP' : 'Q'}
                commentLabel={board === 'qna' ? '답변' : '댓글'}
                accepted={board === 'qna' && Boolean(post.acceptedCommentId)}
                categoryLabel={boardLabel(board)}
                title={
                  post.isDeleted
                    ? COMMUNITY_POST_DELETED_MESSAGE
                    : post.title?.trim() || '제목 없음'
                }
                excerpt={post.isDeleted ? undefined : post.description?.trim()}
                imageUrl={post.imageUrls?.[0] || post.imageUrl || undefined}
                date={formatPhotoCardDate(post.uploadedAt)}
                commentCount={post.commentCount}
                isDeleted={post.isDeleted}
                notice={Boolean(post.isNotice)}
                onClick={() => navigate(`/community/${post.photoId}`)}
              />
            );
          })}
        </div>
      )}
    </SubPageFrame>
  );
}
