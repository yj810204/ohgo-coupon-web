'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Timestamp } from 'firebase/firestore';
import { getUser } from '@/lib/storage';
import { getPhoto, addComment, getComments, updateCommentPoints, deleteComment, CommunityPhoto, Comment } from '@/utils/community-service';
import { awardCommentPoints, getRemainingPoints, getPointRules as getPointRulesAsync, getCommunityPoints, deductCommentPoints } from '@/utils/community-point-service';
import { getTemplate } from '@/utils/community-template-service';
import { getEmojiPacks, extractEmojiIds, renderEmojisInText, EmojiPack } from '@/utils/emoji-pack-service';
import { IoArrowBackOutline, IoChatbubbleOutline, IoCheckmarkCircleOutline, IoHappyOutline } from 'react-icons/io5';
import EmojiPicker from '@/components/EmojiPicker';
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';

function PhotoDetailContent() {
  const router = useRouter();
  const params = useParams();
  const { navigate } = useNavigation();
  const photoId = params?.photoId as string;
  
  const [photo, setPhoto] = useState<CommunityPhoto | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<{ uuid?: string; name?: string } | null>(null);
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
      const u = await getUser();
      if (!u?.uuid) {
        router.replace('/login');
        return;
      }
      setUser(u);
      
      // 포인트 규칙 및 남은 포인트 조회
      const rules = await getPointRulesAsync();
      setPointRules(rules);
      const remaining = await getRemainingPoints(u.uuid);
      setRemainingPoints(remaining);
      // 커뮤니티 포인트 조회
      const communityPointsTotal = await getCommunityPoints(u.uuid);
      setCommunityPoints(communityPointsTotal);
      
      await loadPhoto();
      await loadComments();
    };
    init();
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

  const formatDate = (date: Date | Timestamp | undefined): string => {
    if (!date) return '';
    const d = date instanceof Date ? date : date.toDate();
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  if (loading) {
    return (
      <div className="min-vh-100 bg-light">
        <PageHeader title="상세" />
        <div className="container">
          <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '50vh' }}>
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">로딩 중...</span>
              </div>
              <p className="text-muted">로딩 중...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!photo) {
    return null;
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
      <PageHeader title="상세" />
      <div className="container">
        {/* 사진 */}
        <div className="card shadow-sm mb-3">
          {photo.imageUrls && photo.imageUrls.length > 1 ? (
            <div className="d-flex flex-column">
              {photo.imageUrls.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`${photo.title || '조황사진'} ${index + 1}`}
                  className="w-100"
                  style={{ 
                    width: '100%',
                    objectFit: 'contain',
                    backgroundColor: '#f8f9fa',
                    cursor: 'pointer',
                    marginBottom: index < photo.imageUrls!.length - 1 ? '8px' : '0'
                  }}
                  onClick={() => {
                    // 이미지 확대 보기 (선택사항)
                    window.open(url, '_blank');
                  }}
                />
              ))}
            </div>
          ) : (
            <img
              src={photo.imageUrl}
              alt={photo.title || '조황사진'}
              className="card-img-top w-100"
              style={{ width: '100%', objectFit: 'contain', backgroundColor: '#f8f9fa' }}
            />
          )}
          <div className="card-body" style={{ padding: '16px' }}>
            {photo.title && (
              <h5 className="card-title mb-3" style={{ fontSize: '1.1rem', fontWeight: '600' }}>{photo.title}</h5>
            )}
            {/* 템플릿 필드 표시 */}
            {templateHtml && (
              <div 
                className="card-text mb-3"
                style={{ 
                  lineHeight: '1.6',
                  wordBreak: 'break-word',
                  borderBottom: '1px solid #dee2e6',
                  paddingBottom: '15px',
                  marginBottom: '15px'
                }}
                dangerouslySetInnerHTML={{ __html: templateHtml }}
              />
            )}
            {photo.content ? (
              <div 
                className="card-text"
                dangerouslySetInnerHTML={{ __html: photo.content }}
                style={{ 
                  lineHeight: '1.6',
                  wordBreak: 'break-word'
                }}
              />
            ) : photo.description && (
              <p className="card-text text-muted">{photo.description}</p>
            )}
            <div className="card-text">
              <div className="d-flex flex-column gap-1">
                {photo.photoDate && (
                  <small className="text-muted">
                    촬영일: {formatDate(photo.photoDate)}
                  </small>
                )}
                <small className="text-muted">
                  업로드: {formatDate(photo.uploadedAt)}
                </small>
                <small className="text-muted">
                  작성자: {photo.uploadedByName}
                </small>
              </div>
            </div>
          </div>
        </div>

        {/* 포인트 정보 */}
        <div className="alert alert-info mb-3">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-2 gap-2">
            <span className="d-flex align-items-center">
              <IoCheckmarkCircleOutline size={20} className="me-2 flex-shrink-0" />
              <span className="small">댓글 작성 시 커뮤니티 포인트 적립</span>
            </span>
            <div className="text-start text-md-end">
              <div className="fw-bold small">
                총 커뮤니티 포인트: {communityPoints}포인트
              </div>
              <small className="text-muted">
                남은 적립: {remainingPoints}포인트
              </small>
            </div>
          </div>
          <small className="text-muted d-block" style={{ fontSize: '0.75rem' }}>
            댓글 1개당 {pointRules.pointsPerComment}포인트, 하루 최대 {pointRules.dailyLimit}포인트 (게임 포인트와 별개)
          </small>
        </div>

        {/* 댓글 작성 */}
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <h6 className="card-title mb-3 d-flex align-items-center">
              <IoChatbubbleOutline size={20} className="me-2 flex-shrink-0" />
              댓글 {comments.length}개
            </h6>
            <div className="mb-3">
              <textarea
                ref={textareaRef}
                className="form-control mb-2"
                rows={3}
                placeholder="댓글을 입력하세요... (최소 10자 이상)"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                disabled={submitting || remainingPoints <= 0}
                style={{ fontSize: '14px' }}
              />
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-1 mb-3">
                <small className={commentText.trim().length < 10 ? 'text-danger' : 'text-muted'} style={{ fontSize: '0.75rem' }}>
                  {commentText.trim().length}/10자 이상
                </small>
                {remainingPoints <= 0 && (
                  <small className="text-danger" style={{ fontSize: '0.75rem' }}>
                    오늘 포인트 적립 한도를 모두 사용하셨습니다.
                  </small>
                )}
              </div>
            </div>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary d-flex align-items-center justify-content-center"
                onClick={() => setShowEmojiPicker(true)}
                disabled={submitting || remainingPoints <= 0}
                style={{ 
                  padding: '8px 16px',
                  minWidth: '48px',
                  flexShrink: 0
                }}
                title="이모티콘 추가"
              >
                <IoHappyOutline size={20} />
              </button>
              <button
                className="btn btn-primary flex-grow-1"
                onClick={handleSubmitComment}
                disabled={submitting || !commentText.trim() || commentText.trim().length < 10 || remainingPoints <= 0}
              >
                {submitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                    작성 중...
                  </>
                ) : (
                  '댓글 작성'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 댓글 목록 */}
        <div className="card shadow-sm">
          <div className="card-body">
            {comments.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-4">
                <IoChatbubbleOutline size={48} className="text-muted mb-2" />
                <p className="text-muted mb-0">아직 댓글이 없습니다.</p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">
                {comments.map((comment) => (
                  <div key={comment.commentId} className="border-bottom pb-3">
                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start mb-2 gap-2">
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <strong style={{ fontSize: '0.95rem' }}>{comment.userName}</strong>
                        {comment.pointAwarded > 0 && (
                          <span className="badge bg-success" style={{ fontSize: '0.7rem' }}>
                            +{comment.pointAwarded}포인트
                          </span>
                        )}
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {formatDate(comment.createdAt)}
                        </small>
                        {/* 본인 댓글만 삭제 가능 */}
                        {comment.userId === user?.uuid && (
                          <button
                            className="btn btn-sm btn-outline-danger"
                            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                            onClick={async () => {
                              if (!confirm('댓글을 삭제하시겠습니까? 포인트가 회수됩니다.')) {
                                return;
                              }
                              try {
                                // 댓글 삭제 및 포인트 회수
                                const deleteResult = await deleteComment(photoId, comment.commentId);
                                if (deleteResult && deleteResult.pointAwarded > 0) {
                                  await deductCommentPoints(deleteResult.userId, deleteResult.pointAwarded);
                                }
                                
                                // 댓글 목록 새로고침
                                await loadComments();
                                
                                // 포인트 정보 업데이트
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
                        )}
                      </div>
                    </div>
                    <div
                      className="mb-0"
                      style={{ whiteSpace: 'pre-wrap' }}
                      dangerouslySetInnerHTML={{
                        __html: renderEmojisInText(comment.content.replace(/\n/g, '<br/>'), emojiMap)
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 이모티콘 피커 모달 */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
    </div>
  );
}

export default function PhotoDetailPage() {
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
      <PhotoDetailContent />
    </Suspense>
  );
}

