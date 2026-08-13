'use client';

import { useState, useEffect, useRef, Suspense, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import {
  getPhoto,
  addComment,
  getComments,
  updateCommentPoints,
  deleteComment,
  deletePhoto,
  CommunityPhoto,
  Comment,
  COMMUNITY_POST_DELETED_MESSAGE,
} from '@/utils/community-service';
import { awardCommentPoints, getRemainingPoints, getPointRules as getPointRulesAsync, getCommunityPoints, deductCommentPoints } from '@/utils/community-point-service';
import { getTemplate } from '@/utils/community-template-service';
import { getEmojiPacks, extractEmojiIds, renderEmojisInText, EmojiPack } from '@/utils/emoji-pack-service';
import { IoChatbubbleOutline, IoCreateOutline, IoHappyOutline, IoTrashOutline } from 'react-icons/io5';
import EmojiPicker from '@/components/EmojiPicker';
import SubPageFrame from '@/components/SubPageFrame';
import {
  OhgoPageLoading,
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_LIST_DIVIDER,
} from '@/lib/page-styles';
import EmptyState from '@/components/EmptyState';
import ImageSwipeSlider from '@/components/ImageSwipeSlider';
import { ohgoConfirm } from '@/lib/ohgo-dialog';

const SECTION_TITLE: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#1A1D1F',
  fontFamily: OHGO_FONT,
  margin: 0,
};

const META: CSSProperties = {
  fontSize: 12,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  lineHeight: 1.5,
};

function PhotoDetailContent() {
  const router = useRouter();
  const params = useParams();
  const photoId = params?.photoId as string;
  
  const [photo, setPhoto] = useState<CommunityPhoto | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [user, setUser] = useState<{ uuid?: string; name?: string; isAdmin?: boolean } | null>(null);
  const [remainingPoints, setRemainingPoints] = useState(0);
  const [pointRules, setPointRules] = useState({ pointsPerComment: 1, dailyLimit: 10 });
  const [communityPoints, setCommunityPoints] = useState(0);
  const [templateHtml, setTemplateHtml] = useState<string>('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPacks, setEmojiPacks] = useState<EmojiPack[]>([]);
  const [emojiMap, setEmojiMap] = useState<Record<string, string>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const init = async () => {
      const appUser = await resolveAppUser();
      if (!appUser?.uuid) {
        router.replace('/login');
        return;
      }
      setUser({ uuid: appUser.uuid, name: appUser.name, isAdmin: appUser.isAdmin });

      const rules = await getPointRulesAsync();
      setPointRules(rules);
      const remaining = await getRemainingPoints(appUser.uuid);
      setRemainingPoints(remaining);
      const communityPointsTotal = await getCommunityPoints(appUser.uuid);
      setCommunityPoints(communityPointsTotal);

      await loadPhoto();
      await loadComments();
    };
    void init();
  }, [photoId, router]);

  const loadPhoto = async () => {
    try {
      if (!photoId) return;
      const photoData = await getPhoto(photoId);
      if (!photoData) {
        alert('사진을 찾을 수 없습니다.');
        router.back();
        return;
      }
      setPhoto(photoData);
      
      // 템플릿이 있으면 HTML 생성
      if (photoData.templateId && photoData.templateFieldValues) {
        try {
          const { getTemplate, applyTemplate } = await import('@/utils/community-template-service');
          const template = await getTemplate(photoData.templateId);
          if (template) {
            const html = applyTemplate(template, photoData.templateFieldValues);
            setTemplateHtml(html);
          }
        } catch (error) {
          console.error('Error loading template:', error);
        }
      }
    } catch (error) {
      console.error('Error loading photo:', error);
      alert('사진을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    try {
      if (!photoId) return;
      const commentsList = await getComments(photoId);
      setComments(commentsList);
      
      // 댓글에서 사용된 이모티콘 ID 추출 및 맵 생성
      const allEmojiIds = new Set<string>();
      commentsList.forEach(comment => {
        const ids = extractEmojiIds(comment.content);
        ids.forEach(id => allEmojiIds.add(id));
      });
      
      // 이모티콘 ID에 대한 이미지 URL 맵 생성
      const newEmojiMap: Record<string, string> = {};
      emojiPacks.forEach(pack => {
        pack.emojis.forEach(emoji => {
          if (allEmojiIds.has(emoji.emojiId)) {
            newEmojiMap[emoji.emojiId] = emoji.imageUrl;
          }
        });
      });
      setEmojiMap(newEmojiMap);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  const loadEmojiPacks = async () => {
    try {
      const packs = await getEmojiPacks();
      setEmojiPacks(packs);
      
      // 이모티콘 맵 생성
      const newEmojiMap: Record<string, string> = {};
      packs.forEach(pack => {
        pack.emojis.forEach(emoji => {
          newEmojiMap[emoji.emojiId] = emoji.imageUrl;
        });
      });
      setEmojiMap(newEmojiMap);
    } catch (error) {
      console.error('Error loading emoji packs:', error);
    }
  };

  const handleEmojiSelect = (emojiId: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = commentText;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const emojiText = `:${emojiId}:`;
    
    setCommentText(before + emojiText + after);
    setShowEmojiPicker(false);
    
    // 커서 위치 조정
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + emojiText.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const handleSubmitComment = async () => {
    if (!user?.uuid || !user?.name || !photoId) return;
    
    const trimmedText = commentText.trim();
    if (!trimmedText) {
      alert('댓글을 입력해주세요.');
      return;
    }

    // 최소 10자 이상 입력 체크
    if (trimmedText.length < 10) {
      alert('댓글은 최소 10자 이상 입력해주세요.');
      return;
    }

    if (remainingPoints <= 0) {
      alert(`오늘 포인트 적립 한도를 모두 사용하셨습니다.\n(하루 최대 ${pointRules.dailyLimit}포인트)`);
      return;
    }

    try {
      setSubmitting(true);
      
      // 댓글 작성 (초기 포인트는 0)
      const commentId = await addComment(photoId, user.uuid, user.name, trimmedText, 0);
      
      // 포인트 적립 (본인 작성글 체크를 위해 photo.uploadedBy 전달)
      const result = await awardCommentPoints(user.uuid, photoId, commentId, photo?.uploadedBy);
      
      // 댓글에 포인트 정보 업데이트
      if (result.points > 0) {
        await updateCommentPoints(photoId, commentId, result.points);
      }
      
      // 댓글 목록 새로고침
      await loadComments();
      
      // 포인트 정보 업데이트
      const newRemaining = await getRemainingPoints(user.uuid);
      setRemainingPoints(newRemaining);
      // 커뮤니티 포인트 업데이트
      const newCommunityPoints = await getCommunityPoints(user.uuid);
      setCommunityPoints(newCommunityPoints);
      
      // 성공 메시지
      if (result.points > 0) {
        alert(`댓글이 작성되었습니다!\n+${result.points}커뮤니티 포인트 적립 (총 ${newCommunityPoints}포인트, 남은 적립 가능: ${newRemaining}포인트)`);
      } else if (result.reason) {
        alert(`댓글이 작성되었습니다.\n${result.reason}`);
      } else if (result.isLimitReached) {
        alert('댓글이 작성되었습니다.\n오늘 커뮤니티 포인트 적립 한도에 도달했습니다.');
      }
      
      setCommentText('');
    } catch (error: any) {
      console.error('Error submitting comment:', error);
      alert(error.message || '댓글 작성 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (date: Date | string | undefined): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return '';
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yy}. ${mm}. ${dd}, ${hh}:${mi}`;
  };

  const maskAuthorName = (name: string | undefined): string => {
    const t = (name || '').trim();
    if (!t) return '';
    if (t.length === 1) return t;
    return `${t[0]}**`;
  };

  if (loading) {
    return <OhgoPageLoading />;
  }

  if (!photo) {
    return null;
  }

  const commentLen = commentText.trim().length;
  const canSubmit =
    !submitting && commentLen >= 10 && remainingPoints > 0;
  const isDeleted = photo?.isDeleted === true;
  const isOwner = Boolean(user?.uuid && photo && user.uuid === photo.uploadedBy);
  const isAdmin = user?.isAdmin === true;
  const canManage = Boolean(user?.uuid && photo && (isAdmin || isOwner));
  const hasComments = (photo?.commentCount ?? comments.length) > 0;

  const handleDeletePost = async () => {
    if (!photoId || !photo || deleting) return;

    if (isDeleted) {
      // 소프트 삭제된 글 — 관리자만 완전 삭제
      if (!isAdmin) return;
      if (!(await ohgoConfirm('이미 삭제 처리된 글입니다.\n댓글까지 완전히 삭제할까요?'))) return;
      setDeleting(true);
      try {
        await deletePhoto(photoId, { mode: 'hard' });
        alert('게시글이 완전히 삭제되었습니다.');
        router.replace('/community/photos');
      } catch (error) {
        console.error('Error deleting photo:', error);
        alert(error instanceof Error ? error.message : '게시글 삭제 중 오류가 발생했습니다.');
        setDeleting(false);
      }
      return;
    }

    if (isAdmin) {
      if (!(await ohgoConfirm('이 게시글을 삭제하시겠습니까?'))) return;
      let mode: 'hard' | 'soft' = 'hard';
      if (hasComments) {
        const deleteComments = await ohgoConfirm(
          `댓글 ${photo.commentCount}개가 있습니다.\n댓글까지 함께 삭제할까요?`
        );
        mode = deleteComments ? 'hard' : 'soft';
      }
      setDeleting(true);
      try {
        const result = await deletePhoto(photoId, { mode });
        if (result.mode === 'soft') {
          alert('게시글이 삭제 처리되었습니다. 댓글은 유지됩니다.');
          await loadPhoto();
          setDeleting(false);
        } else {
          alert('게시글이 삭제되었습니다.');
          router.replace('/community/photos');
        }
      } catch (error) {
        console.error('Error deleting photo:', error);
        alert(error instanceof Error ? error.message : '게시글 삭제 중 오류가 발생했습니다.');
        setDeleting(false);
      }
      return;
    }

    // 작성자
    if (hasComments) {
      if (
        !(await ohgoConfirm(
          '이 게시글을 삭제하시겠습니까?\n댓글이 있어 본문만 삭제되고 댓글은 유지됩니다.'
        ))
      ) {
        return;
      }
      setDeleting(true);
      try {
        await deletePhoto(photoId, { mode: 'soft' });
        alert('게시글이 삭제 처리되었습니다. 댓글은 유지됩니다.');
        await loadPhoto();
        setDeleting(false);
      } catch (error) {
        console.error('Error deleting photo:', error);
        alert(error instanceof Error ? error.message : '게시글 삭제 중 오류가 발생했습니다.');
        setDeleting(false);
      }
      return;
    }

    if (!(await ohgoConfirm('이 게시글을 삭제하시겠습니까?'))) return;
    setDeleting(true);
    try {
      await deletePhoto(photoId, { mode: 'hard' });
      alert('게시글이 삭제되었습니다.');
      router.replace('/community/photos');
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert(error instanceof Error ? error.message : '게시글 삭제 중 오류가 발생했습니다.');
      setDeleting(false);
    }
  };

  return (
    <SubPageFrame title="조황 상세">
      {/* 사진 */}
      <div className="mb-3" style={{ ...OHGO_CARD, overflow: 'hidden' }}>
        {isDeleted ? (
          <div
            className="d-flex align-items-center justify-content-center"
            style={{
              width: '100%',
              aspectRatio: '4 / 3',
              backgroundColor: '#F2F3F5',
              color: '#6F767E',
              fontFamily: OHGO_FONT,
              fontSize: 14,
              fontWeight: 600,
              padding: 24,
              textAlign: 'center',
            }}
          >
            {COMMUNITY_POST_DELETED_MESSAGE}
          </div>
        ) : (
          <ImageSwipeSlider
            urls={
              photo.imageUrls && photo.imageUrls.length > 0
                ? photo.imageUrls
                : photo.imageUrl
                  ? [photo.imageUrl]
                  : []
            }
            alt={photo.title || '조황사진'}
            onImageClick={(url) => window.open(url, '_blank')}
          />
        )}
        <div style={{ padding: '16px' }}>
          {isDeleted ? (
            <p
              style={{
                fontSize: 14,
                color: '#6F767E',
                fontFamily: OHGO_FONT,
                marginBottom: 12,
                lineHeight: 1.55,
              }}
            >
              {COMMUNITY_POST_DELETED_MESSAGE}
            </p>
          ) : (
            <>
              {photo.title ? (
                <h5 style={{ ...SECTION_TITLE, fontSize: 17, marginBottom: 12 }}>{photo.title}</h5>
              ) : null}
              {templateHtml ? (
                <div
                  className="mb-3"
                  style={{
                    lineHeight: 1.6,
                    wordBreak: 'break-word',
                    borderBottom: '1px solid #F7F8FA',
                    paddingBottom: 12,
                    fontFamily: OHGO_FONT,
                    fontSize: 14,
                    color: '#1A1D1F',
                  }}
                  dangerouslySetInnerHTML={{ __html: templateHtml }}
                />
              ) : null}
              {photo.content ? (
                <div
                  style={{
                    lineHeight: 1.6,
                    wordBreak: 'break-word',
                    fontFamily: OHGO_FONT,
                    fontSize: 14,
                    color: '#1A1D1F',
                    marginBottom: 12,
                  }}
                  dangerouslySetInnerHTML={{ __html: photo.content }}
                />
              ) : photo.description ? (
                <p style={{ ...META, fontSize: 14, marginBottom: 12 }}>{photo.description}</p>
              ) : null}
            </>
          )}
          <div className="d-flex flex-column gap-1">
            {!isDeleted && photo.photoDate ? (
              <span style={META}>촬영일: {formatDate(photo.photoDate)}</span>
            ) : null}
            <span style={META}>업로드: {formatDate(photo.uploadedAt)}</span>
            <span style={META}>
              작성자: {canManage ? photo.uploadedByName : maskAuthorName(photo.uploadedByName)}
            </span>
          </div>
          {canManage && (!isDeleted || isAdmin) ? (
            <div className="d-flex gap-2 mt-3">
              {!isDeleted ? (
                <button
                  type="button"
                  className={`btn flex-grow-1 d-flex align-items-center justify-content-center gap-1 ${OHGO_DISMISS_BTN_CLASS}`}
                  style={{ ...OHGO_DISMISS_BTN, padding: '10px 12px', fontSize: 14 }}
                  disabled={deleting}
                  onClick={() =>
                    router.push(`/community/photos/upload?photoId=${encodeURIComponent(photo.photoId)}`)
                  }
                >
                  <IoCreateOutline size={16} />
                  수정
                </button>
              ) : null}
              <button
                type="button"
                className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                style={{
                  backgroundColor: '#FFEBEE',
                  color: '#E53935',
                  borderRadius: 1000,
                  padding: '10px 12px',
                  border: 'none',
                  fontFamily: OHGO_FONT,
                  fontSize: 14,
                  fontWeight: 700,
                  opacity: deleting ? 0.65 : 1,
                }}
                disabled={deleting}
                onClick={() => void handleDeletePost()}
              >
                <IoTrashOutline size={16} />
                {deleting ? '삭제 중...' : isDeleted ? '완전 삭제' : '삭제'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* 포인트 정보 */}
      <div
        className="mb-3"
        style={{
          ...OHGO_CARD,
          padding: '14px 16px',
          backgroundColor: '#EBF1FE',
          boxShadow: 'none',
        }}
      >
        <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1D1F', fontFamily: OHGO_FONT }}>
            댓글 작성 시 커뮤니티 포인트 적립
          </div>
          <div className="text-end flex-shrink-0">
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1B6FF5', fontFamily: OHGO_FONT }}>
              {communityPoints}P
            </div>
            <div style={META}>오늘 남은 적립 {remainingPoints}P</div>
          </div>
        </div>
        <div style={META}>
          댓글 1개당 {pointRules.pointsPerComment}P · 하루 최대 {pointRules.dailyLimit}P
        </div>
      </div>

      {/* 댓글 작성 */}
      <div className="mb-3" style={{ ...OHGO_CARD, padding: 16 }}>
        <div className="d-flex align-items-center gap-2 mb-3">
          <IoChatbubbleOutline size={18} color="#1B6FF5" className="flex-shrink-0" />
          <h6 style={SECTION_TITLE}>댓글 {comments.length}개</h6>
        </div>

        <textarea
          ref={textareaRef}
          className="form-control mb-2"
          rows={3}
          placeholder="댓글을 입력하세요 (최소 10자)"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          disabled={submitting || remainingPoints <= 0}
          style={{ ...OHGO_INPUT, resize: 'none', minHeight: 88 }}
        />

        <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
          <span
            style={{
              ...META,
              color: commentLen > 0 && commentLen < 10 ? '#E53935' : '#6F767E',
            }}
          >
            {commentLen}/10자
          </span>
          {remainingPoints <= 0 ? (
            <span style={{ ...META, color: '#E53935' }}>오늘 적립 한도 소진</span>
          ) : null}
        </div>

        <div className="d-flex gap-2">
          <button
            type="button"
            className={`btn d-flex align-items-center justify-content-center flex-shrink-0 ${OHGO_DISMISS_BTN_CLASS}`}
            onClick={() => setShowEmojiPicker(true)}
            disabled={submitting || remainingPoints <= 0}
            style={{ ...OHGO_DISMISS_BTN, padding: '12px 14px', minWidth: 48 }}
            title="이모티콘 추가"
            aria-label="이모티콘 추가"
          >
            <IoHappyOutline size={22} />
          </button>
          <button
            type="button"
            className={`btn flex-grow-1 d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
            onClick={handleSubmitComment}
            disabled={!canSubmit}
            style={{
              ...OHGO_CONFIRM_BTN,
              padding: '12px 16px',
              opacity: canSubmit ? 1 : 0.55,
            }}
          >
            {submitting ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" />
                <span>작성 중...</span>
              </>
            ) : (
              '댓글 작성'
            )}
          </button>
        </div>
      </div>

      {/* 댓글 목록 */}
      <div style={{ ...OHGO_CARD, overflow: 'hidden' }}>
        {comments.length === 0 ? (
          <div style={{ padding: '8px 16px 16px' }}>
            <EmptyState icon={IoChatbubbleOutline} message="아직 댓글이 없습니다." compact />
          </div>
        ) : (
          <div className="d-flex flex-column">
            {comments.map((comment, index) => (
              <div key={comment.commentId}>
                {index > 0 ? <div style={OHGO_LIST_DIVIDER} /> : null}
                <div style={{ padding: '14px 16px' }}>
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <div className="d-flex flex-wrap align-items-center gap-2 min-w-0">
                      <strong
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#1A1D1F',
                          fontFamily: OHGO_FONT,
                        }}
                      >
                        {comment.userName}
                      </strong>
                      {comment.pointAwarded > 0 ? (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            fontFamily: OHGO_FONT,
                            backgroundColor: '#E8F5E9',
                            color: '#2E7D32',
                          }}
                        >
                          +{comment.pointAwarded}P
                        </span>
                      ) : null}
                    </div>
                    <div className="d-flex align-items-center gap-2 flex-shrink-0">
                      <span style={META}>{formatDate(comment.createdAt)}</span>
                      {comment.userId === user?.uuid ? (
                        <button
                          type="button"
                          className="btn btn-link p-0"
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#E53935',
                            fontFamily: OHGO_FONT,
                            textDecoration: 'none',
                          }}
                          onClick={async () => {
                            if (!(await ohgoConfirm('댓글을 삭제하시겠습니까? 포인트가 회수됩니다.'))) {
                              return;
                            }
                            try {
                              const deleteResult = await deleteComment(photoId, comment.commentId);
                              if (deleteResult && deleteResult.pointAwarded > 0) {
                                await deductCommentPoints(deleteResult.userId, deleteResult.pointAwarded);
                              }
                              await loadComments();
                              if (user?.uuid) {
                                const newRemaining = await getRemainingPoints(user.uuid);
                                setRemainingPoints(newRemaining);
                                const newCommunityPoints = await getCommunityPoints(user.uuid);
                                setCommunityPoints(newCommunityPoints);
                              }
                              if (deleteResult && deleteResult.pointAwarded > 0) {
                                alert(`댓글이 삭제되었습니다.\n${deleteResult.pointAwarded}포인트가 회수되었습니다.`);
                              } else {
                                alert('댓글이 삭제되었습니다.');
                              }
                            } catch (error: any) {
                              console.error('Error deleting comment:', error);
                              alert('댓글 삭제 중 오류가 발생했습니다.');
                            }
                          }}
                        >
                          삭제
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: '#1A1D1F',
                      fontFamily: OHGO_FONT,
                      lineHeight: 1.55,
                      wordBreak: 'break-word',
                    }}
                    dangerouslySetInnerHTML={{
                      __html: renderEmojisInText(comment.content.replace(/\n/g, '<br/>'), emojiMap),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEmojiPicker ? (
        <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
      ) : null}
    </SubPageFrame>
  );
}

export default function PhotoDetailPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <PhotoDetailContent />
    </Suspense>
  );
}

