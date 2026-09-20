'use client';

import { useState, useEffect, useRef, Suspense, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { getUser } from '@/lib/storage';
import { resolveAppUser } from '@/lib/auth-session';
import {
  getPhoto,
  addComment,
  getComments,
  updateComment,
  updateCommentPoints,
  deleteComment,
  deletePhoto,
  acceptQnaAnswer,
  CommunityPhoto,
  Comment,
  COMMUNITY_POST_DELETED_MESSAGE,
  communityBoardTitle,
  communityListPath,
  communityWritePath,
} from '@/utils/community-service';
import { categoryLabel, getBoardCategories } from '@/utils/board-category-service';
import { awardCommentPoints, getRemainingPoints, getPointRules as getPointRulesAsync, getCommunityPoints, deductCommentPoints } from '@/utils/community-point-service';
import { getTemplate } from '@/utils/community-template-service';
import { getEmojiPacks, extractEmojiIds, renderEmojisInText, EmojiPack } from '@/utils/emoji-pack-service';
import {
  IoArrowUndoOutline,
  IoChatbubbleOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoCloseOutline,
  IoCreateOutline,
  IoEllipsisHorizontal,
  IoHappyOutline,
  IoTrashOutline,
  IoCheckmarkCircleOutline,
} from 'react-icons/io5';
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
import { displayMemberName, maskAuthorName } from '@/lib/mask-member-name';
import { communityPageHeaderAction } from '@/lib/page-header-action';

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
  const [replyTo, setReplyTo] = useState<{ commentId: string; userName: string } | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [user, setUser] = useState<{
    uuid?: string;
    name?: string;
    isAdmin?: boolean;
    isCaptain?: boolean;
  } | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const manageMenuRef = useRef<HTMLDivElement>(null);
  const [commentMenuId, setCommentMenuId] = useState<string | null>(null);
  const commentMenuRef = useRef<HTMLDivElement>(null);
  const [remainingPoints, setRemainingPoints] = useState(0);
  const [pointRules, setPointRules] = useState({ pointsPerComment: 1, dailyLimit: 10 });
  const [communityPoints, setCommunityPoints] = useState(0);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [templateHtml, setTemplateHtml] = useState<string>('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPacks, setEmojiPacks] = useState<EmojiPack[]>([]);
  const [emojiMap, setEmojiMap] = useState<Record<string, string>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lightboxTouchX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const local = await getUser();
      if (local?.uuid) {
        setUser({
          uuid: local.uuid,
          name: local.name,
          isAdmin: local.isAdmin,
        });
      }

      const uuidHint = local?.uuid;
      const [appUserResult, photoResult, commentsResult, rulesResult, remainingResult, pointsResult] =
        await Promise.allSettled([
          resolveAppUser(),
          photoId ? getPhoto(photoId) : Promise.resolve(null),
          photoId ? getComments(photoId) : Promise.resolve([]),
          getPointRulesAsync(),
          uuidHint ? getRemainingPoints(uuidHint) : Promise.resolve(0),
          uuidHint ? getCommunityPoints(uuidHint) : Promise.resolve(0),
        ]);

      if (cancelled) return;

      const appUser = appUserResult.status === 'fulfilled' ? appUserResult.value : null;
      if (!appUser?.uuid) {
        router.replace('/login');
        return;
      }
      setUser({
        uuid: appUser.uuid,
        name: appUser.name,
        isAdmin: appUser.isAdmin,
        isCaptain: appUser.isCaptain,
      });

      if (rulesResult.status === 'fulfilled') setPointRules(rulesResult.value);
      if (remainingResult.status === 'fulfilled') setRemainingPoints(remainingResult.value);
      if (pointsResult.status === 'fulfilled') setCommunityPoints(pointsResult.value);

      if (!uuidHint || uuidHint !== appUser.uuid) {
        const [remaining, points] = await Promise.all([
          getRemainingPoints(appUser.uuid),
          getCommunityPoints(appUser.uuid),
        ]);
        if (!cancelled) {
          setRemainingPoints(remaining);
          setCommunityPoints(points);
        }
      }

      const photoData = photoResult.status === 'fulfilled' ? photoResult.value : null;
      if (!photoData) {
        alert('사진을 찾을 수 없습니다.');
        router.back();
        return;
      }
      setPhoto(photoData);
      if (photoData.boardType === 'qna' || photoData.boardType === 'faq') {
        const cats = await getBoardCategories(photoData.boardType, { includeInactive: true });
        if (!cancelled) setCategoryName(categoryLabel(photoData.boardType, photoData.category, cats));
      }
      setLoading(false);

      if (commentsResult.status === 'fulfilled') {
        setComments(commentsResult.value);
      }

      if (photoData.templateId && photoData.templateFieldValues) {
        try {
          const { getTemplate, applyTemplate } = await import('@/utils/community-template-service');
          const template = await getTemplate(photoData.templateId);
          if (template && !cancelled) {
            setTemplateHtml(applyTemplate(template, photoData.templateFieldValues));
          }
        } catch (error) {
          console.error('Error loading template:', error);
        }
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
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
      if (photoData.boardType === 'qna' || photoData.boardType === 'faq') {
        const cats = await getBoardCategories(photoData.boardType, { includeInactive: true });
        setCategoryName(categoryLabel(photoData.boardType, photoData.category, cats));
      }

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

  const resetComposer = () => {
    setCommentText('');
    setReplyTo(null);
    setEditingCommentId(null);
  };

  const startReply = (comment: Comment) => {
    setEditingCommentId(null);
    setReplyTo({ commentId: comment.commentId, userName: comment.userName });
    setCommentText('');
    setCommentMenuId(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const startEditComment = (comment: Comment) => {
    setReplyTo(null);
    setEditingCommentId(comment.commentId);
    setCommentText(comment.content);
    setCommentMenuId(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSubmitComment = async () => {
    if (!user?.uuid || !user?.name || !photoId) return;
    
    const trimmedText = commentText.trim();
    const qnaPost = photo?.boardType === 'qna';
    const noun = qnaPost ? '답변' : '댓글';

    if (!trimmedText) {
      alert(`${noun}을 입력해주세요.`);
      return;
    }

    if (trimmedText.length < 10) {
      alert(`${noun}은 최소 10자 이상 입력해주세요.`);
      return;
    }

    if (editingCommentId) {
      try {
        setSubmitting(true);
        await updateComment(photoId, editingCommentId, trimmedText);
        await loadComments();
        resetComposer();
      } catch (error: unknown) {
        console.error('Error updating comment:', error);
        alert(error instanceof Error ? error.message : `${noun} 수정 중 오류가 발생했습니다.`);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!qnaPost && remainingPoints <= 0) {
      alert(`오늘 포인트 적립 한도를 모두 사용하셨습니다.\n(하루 최대 ${pointRules.dailyLimit}포인트)`);
      return;
    }

    if (replyTo && photo?.uploadedBy && user.uuid === photo.uploadedBy) {
      alert('본인이 작성한 글에는 대댓글을 달 수 없습니다.');
      return;
    }

    try {
      setSubmitting(true);
      
      const commentId = await addComment(
        photoId,
        user.uuid,
        user.name,
        trimmedText,
        0,
        replyTo?.commentId
      );
      
      if (!qnaPost) {
        const result = await awardCommentPoints(user.uuid, photoId, commentId, photo?.uploadedBy);

        if (result.points > 0) {
          await updateCommentPoints(photoId, commentId, result.points);
        }

        await loadComments();

        const newRemaining = await getRemainingPoints(user.uuid);
        setRemainingPoints(newRemaining);
        const newCommunityPoints = await getCommunityPoints(user.uuid);
        setCommunityPoints(newCommunityPoints);

        if (result.points > 0) {
          alert(`댓글이 작성되었습니다!\n+${result.points}커뮤니티 포인트 적립 (총 ${newCommunityPoints}포인트, 남은 적립 가능: ${newRemaining}포인트)`);
        } else if (result.reason) {
          alert(`댓글이 작성되었습니다.\n${result.reason}`);
        } else if (result.isLimitReached) {
          alert('댓글이 작성되었습니다.\n오늘 커뮤니티 포인트 적립 한도에 도달했습니다.');
        }
      } else {
        await loadComments();
        alert(replyTo ? '답글이 등록되었습니다.' : '답변이 등록되었습니다. 선정되면 포인트가 적립됩니다.');
      }
      
      resetComposer();
    } catch (error: unknown) {
      console.error('Error submitting comment:', error);
      alert(error instanceof Error ? error.message : `${noun} 작성 중 오류가 발생했습니다.`);
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

  useEffect(() => {
    if (!manageMenuOpen && !commentMenuId) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (manageMenuRef.current?.contains(target) || commentMenuRef.current?.contains(target)) {
        return;
      }
      setManageMenuOpen(false);
      setCommentMenuId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [manageMenuOpen, commentMenuId]);

  useEffect(() => {
    if (previewIndex == null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const urlCount =
      photo?.imageUrls && photo.imageUrls.length > 0
        ? photo.imageUrls.length
        : photo?.imageUrl
          ? 1
          : 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewIndex(null);
      if (e.key === 'ArrowLeft') {
        setPreviewIndex((i) => (i == null ? i : Math.max(0, i - 1)));
      }
      if (e.key === 'ArrowRight') {
        setPreviewIndex((i) => (i == null ? i : Math.min(Math.max(urlCount - 1, 0), i + 1)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [previewIndex, photo]);

  if (loading) {
    return <OhgoPageLoading />;
  }

  if (!photo) {
    return null;
  }

  const commentLen = commentText.trim().length;
  const isEditingComment = Boolean(editingCommentId);
  const isDeleted = photo?.isDeleted === true;
  const isOwner = Boolean(user?.uuid && photo && user.uuid === photo.uploadedBy);
  const isAdmin = user?.isAdmin === true;
  const canSeeFullNames = Boolean(user?.isAdmin || user?.isCaptain);
  const canManage = Boolean(user?.uuid && photo && (isAdmin || isOwner));
  const showManageMenu = canManage && (!isDeleted || isAdmin);
  const hasComments = (photo?.commentCount ?? comments.length) > 0;
  const isQna = photo.boardType === 'qna';
  const isFaq = photo.boardType === 'faq';
  const commentNoun = isQna ? '답변' : '댓글';
  const canSubmit =
    !submitting && commentLen >= 10 && (isEditingComment || isQna || remainingPoints > 0);
  const canReplyOnPost = Boolean(user?.uuid && photo && user.uuid !== photo.uploadedBy);
  const listPath = communityListPath(photo.boardType);
  const photoUrls =
    photo.imageUrls && photo.imageUrls.length > 0
      ? photo.imageUrls
      : photo.imageUrl
        ? [photo.imageUrl]
        : [];

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
        router.replace(listPath);
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
          router.replace(listPath);
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
      router.replace(listPath);
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert(error instanceof Error ? error.message : '게시글 삭제 중 오류가 발생했습니다.');
      setDeleting(false);
    }
  };

  const commentTime = (c: Comment) => {
    const d = typeof c.createdAt === 'string' ? new Date(c.createdAt) : c.createdAt;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  };
  const rootComments = comments
    .filter((c) => !c.parentId)
    .sort((a, b) => {
      const aAccepted = a.isAccepted || a.commentId === photo.acceptedCommentId;
      const bAccepted = b.isAccepted || b.commentId === photo.acceptedCommentId;
      if (aAccepted !== bAccepted) return aAccepted ? -1 : 1;
      return commentTime(b) - commentTime(a);
    });
  const repliesOf = (parentId: string) =>
    comments
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => commentTime(a) - commentTime(b));

  const handleAcceptAnswer = async (comment: Comment) => {
    if (!photoId || !isAdmin || !isQna || comment.parentId || acceptingId) return;
    const already = comments.some((item) => item.isAccepted || item.commentId === photo.acceptedCommentId);
    if (
      !(await ohgoConfirm(
        already
          ? '이미 선정된 답변이 있습니다. 이 답변으로 바꿀까요?\n이전 선정 포인트는 회수됩니다.'
          : '이 답변을 선정할까요?\n작성자에게 커뮤니티 포인트가 적립됩니다.'
      ))
    ) {
      return;
    }
    try {
      setAcceptingId(comment.commentId);
      const result = await acceptQnaAnswer(photoId, comment.commentId);
      await Promise.all([loadPhoto(), loadComments()]);
      if (result.alreadyAccepted) {
        alert('이미 선정된 답변입니다.');
      } else if (result.awarded > 0) {
        alert(`답변이 선정되었습니다.\n+${result.awarded}포인트가 적립되었습니다.`);
      } else {
        alert('답변이 선정되었습니다.');
      }
    } catch (error: unknown) {
      console.error('Error accepting answer:', error);
      alert(error instanceof Error ? error.message : '답변 선정 중 오류가 발생했습니다.');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDeleteComment = async (comment: Comment) => {
    const hasReplies = comments.some((c) => c.parentId === comment.commentId);
    if (
      !(await ohgoConfirm(
        hasReplies
          ? '이 댓글과 답글이 함께 삭제됩니다. 포인트가 회수됩니다.'
          : '댓글을 삭제하시겠습니까? 포인트가 회수됩니다.'
      ))
    ) {
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
    } catch (error: unknown) {
      console.error('Error deleting comment:', error);
      alert('댓글 삭제 중 오류가 발생했습니다.');
    }
  };

  const renderCommentRow = (comment: Comment, isReply: boolean) => {
    const isMine = comment.userId === user?.uuid;
    const canReply = canReplyOnPost && !isReply && !isMine;
    const isAccepted = Boolean(comment.isAccepted || comment.commentId === photo.acceptedCommentId);
    const canAccept = isAdmin && isQna && !isReply && !isAccepted;
    return (
      <div
        style={{
          padding: isReply ? '10px 16px 10px 36px' : '14px 16px',
          backgroundColor: isAccepted ? '#F3FBF6' : undefined,
        }}
      >
        <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
          <div className="d-flex flex-wrap align-items-center gap-2 min-w-0">
            <strong
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#1A1D1F',
                fontFamily: OHGO_FONT,
              }}
            >
              {displayMemberName(comment.userName, canSeeFullNames)}
            </strong>
            {isAccepted ? (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: OHGO_FONT,
                  backgroundColor: '#E8F8EE',
                  color: '#2E7D32',
                }}
              >
                채택
              </span>
            ) : null}
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
          <div className="d-flex align-items-center gap-1 flex-shrink-0">
            <span style={META}>{formatDate(comment.createdAt)}</span>
            {isMine ? (
              <div
                ref={commentMenuId === comment.commentId ? commentMenuRef : undefined}
                className="position-relative"
              >
                <button
                  type="button"
                  className="btn p-0 border-0"
                  aria-label="더보기"
                  aria-expanded={commentMenuId === comment.commentId}
                  onClick={() => {
                    setManageMenuOpen(false);
                    setCommentMenuId((id) =>
                      id === comment.commentId ? null : comment.commentId
                    );
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    color: '#6F767E',
                  }}
                >
                  <IoEllipsisHorizontal size={18} />
                </button>
                {commentMenuId === comment.commentId ? (
                  <div
                    className="d-flex flex-column"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      zIndex: 30,
                      minWidth: 132,
                      padding: 6,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 12,
                      boxShadow: '0 8px 24px rgba(26, 29, 31, 0.14)',
                    }}
                  >
                    <button
                      type="button"
                      className="btn d-flex align-items-center gap-2 text-start border-0"
                      style={{
                        padding: '10px 12px',
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: OHGO_FONT,
                        color: '#1A1D1F',
                        background: 'transparent',
                        borderRadius: 8,
                      }}
                      onClick={() => startEditComment(comment)}
                    >
                      <IoCreateOutline size={16} />
                      수정
                    </button>
                    <button
                      type="button"
                      className="btn d-flex align-items-center gap-2 text-start border-0"
                      style={{
                        padding: '10px 12px',
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: OHGO_FONT,
                        color: '#E53935',
                        background: 'transparent',
                        borderRadius: 8,
                      }}
                      onClick={() => {
                        setCommentMenuId(null);
                        void handleDeleteComment(comment);
                      }}
                    >
                      <IoTrashOutline size={16} />
                      삭제
                    </button>
                  </div>
                ) : null}
              </div>
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
        <div className="d-flex align-items-center gap-3 mt-2">
          {canReply ? (
            <button
              type="button"
              className="btn btn-link p-0 d-inline-flex align-items-center gap-1"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#1B6FF5',
                fontFamily: OHGO_FONT,
                textDecoration: 'none',
              }}
              onClick={() => startReply(comment)}
            >
              <IoArrowUndoOutline size={14} />
              답글
            </button>
          ) : null}
          {canAccept ? (
            <button
              type="button"
              className="btn btn-link p-0 d-inline-flex align-items-center gap-1"
              disabled={acceptingId === comment.commentId}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#2E7D32',
                fontFamily: OHGO_FONT,
                textDecoration: 'none',
              }}
              onClick={() => void handleAcceptAnswer(comment)}
            >
              <IoCheckmarkCircleOutline size={15} />
              {acceptingId === comment.commentId ? '선정 중...' : '답변 선정'}
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <SubPageFrame
      title={communityBoardTitle(photo.boardType)}
      onBack={() => router.replace(listPath)}
      headerAction={communityPageHeaderAction({
        board: photo.boardType,
        user,
        post: photo,
        onNavigate: (path) => router.push(path),
      })}
    >
      {/* 사진 */}
      <div className="mb-3" style={OHGO_CARD}>
        {(isDeleted || photoUrls.length > 0) ? (
        <div style={{ overflow: 'hidden', borderRadius: '16px 16px 0 0' }}>
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
            urls={photoUrls}
            alt={photo.title || (isFaq ? '팁 사진' : isQna ? '질문 사진' : '조황사진')}
            onImageClick={(_url, index) => setPreviewIndex(index)}
          />
        )}
        </div>
        ) : null}
        <div style={{ padding: '16px' }}>
          {isDeleted || photo.title || showManageMenu ? (
            <div className="d-flex align-items-center justify-content-between gap-2">
              <div className="min-w-0 flex-grow-1 d-flex align-items-center">
                {isDeleted ? (
                  <p
                    style={{
                      fontSize: 14,
                      color: '#6F767E',
                      fontFamily: OHGO_FONT,
                      margin: 0,
                      lineHeight: '32px',
                    }}
                  >
                    {COMMUNITY_POST_DELETED_MESSAGE}
                  </p>
                ) : photo.title ? (
                  <div className="min-w-0">
                    {photo.isNotice || categoryName ? (
                      <div className="d-flex align-items-center gap-1 mb-1">
                        {photo.isNotice ? (
                          <div
                            className="d-inline-flex align-items-center"
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              fontFamily: OHGO_FONT,
                              color: '#fff',
                              backgroundColor: '#C62828',
                              borderRadius: 6,
                              padding: '3px 8px',
                            }}
                          >
                            공지
                          </div>
                        ) : null}
                        {categoryName ? (
                          <div
                            className="d-inline-flex align-items-center"
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              fontFamily: OHGO_FONT,
                              color: isFaq ? '#E65100' : isQna ? '#1B6FF5' : '#6F767E',
                              backgroundColor: isFaq ? '#FFF4E5' : '#EBF1FE',
                              borderRadius: 6,
                              padding: '3px 8px',
                            }}
                          >
                            {categoryName}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <h5 style={{ ...SECTION_TITLE, fontSize: 17, margin: 0, lineHeight: 1.4 }}>{photo.title}</h5>
                  </div>
                ) : null}
              </div>
              {showManageMenu ? (
                <div ref={manageMenuRef} className="position-relative flex-shrink-0">
                  <button
                    type="button"
                    className="btn p-0 border-0"
                    aria-label="더보기"
                    aria-expanded={manageMenuOpen}
                    disabled={deleting}
                    onClick={() => {
                      setCommentMenuId(null);
                      setManageMenuOpen((open) => !open);
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'transparent',
                      color: '#6F767E',
                    }}
                  >
                    <IoEllipsisHorizontal size={22} />
                  </button>
                  {manageMenuOpen ? (
                    <div
                      className="d-flex flex-column"
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        zIndex: 30,
                        minWidth: 132,
                        padding: 6,
                        backgroundColor: '#FFFFFF',
                        borderRadius: 12,
                        boxShadow: '0 8px 24px rgba(26, 29, 31, 0.14)',
                      }}
                    >
                      {!isDeleted ? (
                        <button
                          type="button"
                          className="btn d-flex align-items-center gap-2 text-start border-0"
                          style={{
                            padding: '10px 12px',
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: OHGO_FONT,
                            color: '#1A1D1F',
                            background: 'transparent',
                            borderRadius: 8,
                          }}
                          onClick={() => {
                            setManageMenuOpen(false);
                            router.push(
                              `${communityWritePath(photo.boardType)}?photoId=${encodeURIComponent(photo.photoId)}`
                            );
                          }}
                        >
                          <IoCreateOutline size={16} />
                          수정
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn d-flex align-items-center gap-2 text-start border-0"
                        style={{
                          padding: '10px 12px',
                          fontSize: 14,
                          fontWeight: 600,
                          fontFamily: OHGO_FONT,
                          color: '#E53935',
                          background: 'transparent',
                          borderRadius: 8,
                        }}
                        onClick={() => {
                          setManageMenuOpen(false);
                          void handleDeletePost();
                        }}
                      >
                        <IoTrashOutline size={16} />
                        {deleting ? '삭제 중...' : isDeleted ? '완전 삭제' : '삭제'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mb-3" style={{ ...META, marginTop: photo.title || isDeleted || showManageMenu ? 4 : 0 }}>
            {[
              canSeeFullNames || isOwner
                ? photo.uploadedByName
                : maskAuthorName(photo.uploadedByName),
              formatDate(photo.uploadedAt),
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {!isDeleted ? (
            <>
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
                  }}
                  dangerouslySetInnerHTML={{ __html: photo.content }}
                />
              ) : photo.description ? (
                <p style={{ ...META, fontSize: 14, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                  {photo.description}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* 댓글 작성 */}
      <div className="mb-3" style={{ ...OHGO_CARD, padding: 16 }}>
        <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
          <div className="d-flex align-items-center gap-2 min-w-0">
            <IoChatbubbleOutline size={18} color="#1B6FF5" className="flex-shrink-0" />
            <h6 style={SECTION_TITLE}>{commentNoun} {comments.length}개</h6>
          </div>
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            {!isQna && remainingPoints <= 0 ? (
              <span style={{ ...META, color: '#E53935' }}>오늘 적립 한도 소진</span>
            ) : null}
            <span
              style={{
                ...META,
                color: commentLen > 0 && commentLen < 10 ? '#E53935' : '#6F767E',
              }}
            >
              {commentLen}/10자
            </span>
          </div>
        </div>

        {isQna && !isEditingComment && !replyTo ? (
          <p style={{ ...META, marginBottom: 10 }}>답변 선정 시 포인트가 적립됩니다.</p>
        ) : null}

        {replyTo || isEditingComment ? (
          <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
            <span style={{ ...META, color: '#1B6FF5', fontWeight: 600 }}>
              {isEditingComment
                ? `${commentNoun} 수정`
                : `${displayMemberName(replyTo?.userName, canSeeFullNames)}님에게 답글`}
            </span>
            <button
              type="button"
              className="btn btn-link p-0"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#6F767E',
                fontFamily: OHGO_FONT,
                textDecoration: 'none',
              }}
              onClick={resetComposer}
            >
              취소
            </button>
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          className="form-control mb-3"
          rows={3}
          placeholder={
            isEditingComment
              ? `${commentNoun}을 수정하세요 (최소 10자)`
              : replyTo
                ? '답글을 입력하세요 (최소 10자)'
                : isQna
                  ? '답변을 입력하세요 (최소 10자)'
                  : '댓글을 입력하세요 (최소 10자)'
          }
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          disabled={submitting || (!isQna && !isEditingComment && remainingPoints <= 0)}
          style={{ ...OHGO_INPUT, resize: 'none', minHeight: 88 }}
        />

        <div className="d-flex gap-2">
          <button
            type="button"
            className={`btn d-flex align-items-center justify-content-center flex-shrink-0 ${OHGO_DISMISS_BTN_CLASS}`}
            onClick={() => setShowEmojiPicker(true)}
            disabled={submitting || (!isQna && !isEditingComment && remainingPoints <= 0)}
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
              isEditingComment ? '수정 완료' : replyTo ? '답글 작성' : isQna ? '답변 작성' : '댓글 작성'
            )}
          </button>
        </div>
      </div>

      {/* 댓글 목록 */}
      <div style={OHGO_CARD}>
        {comments.length === 0 ? (
          <div style={{ padding: '8px 16px 16px' }}>
            <EmptyState icon={IoChatbubbleOutline} message={isQna ? '아직 답변이 없습니다.' : '아직 댓글이 없습니다.'} compact />
          </div>
        ) : (
          <div className="d-flex flex-column">
            {rootComments.map((comment, index) => {
              const replies = repliesOf(comment.commentId);
              return (
                <div key={comment.commentId}>
                  {index > 0 ? <div style={OHGO_LIST_DIVIDER} /> : null}
                  {renderCommentRow(comment, false)}
                  {replies.map((reply) => (
                    <div key={reply.commentId}>{renderCommentRow(reply, true)}</div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showEmojiPicker ? (
        <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
      ) : null}

      {previewIndex != null && photoUrls[previewIndex] && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="ohgo-photo-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label="사진 보기"
              onClick={() => setPreviewIndex(null)}
              onTouchStart={(e) => {
                lightboxTouchX.current = e.changedTouches[0]?.clientX ?? null;
              }}
              onTouchEnd={(e) => {
                const startX = lightboxTouchX.current;
                lightboxTouchX.current = null;
                if (startX == null || photoUrls.length < 2) return;
                const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
                if (Math.abs(dx) < 40) return;
                setPreviewIndex((i) => {
                  if (i == null) return i;
                  return dx > 0
                    ? Math.max(0, i - 1)
                    : Math.min(photoUrls.length - 1, i + 1);
                });
              }}
            >
              <button
                type="button"
                className="ohgo-photo-lightbox__close"
                onClick={() => setPreviewIndex(null)}
                aria-label="닫기"
              >
                <IoCloseOutline size={22} />
                닫기
              </button>
              {photoUrls.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="ohgo-photo-lightbox__nav ohgo-photo-lightbox__nav--prev"
                    disabled={previewIndex <= 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewIndex((i) => (i == null ? i : Math.max(0, i - 1)));
                    }}
                    aria-label="이전 사진"
                  >
                    <IoChevronBackOutline size={22} />
                  </button>
                  <button
                    type="button"
                    className="ohgo-photo-lightbox__nav ohgo-photo-lightbox__nav--next"
                    disabled={previewIndex >= photoUrls.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewIndex((i) =>
                        i == null ? i : Math.min(photoUrls.length - 1, i + 1)
                      );
                    }}
                    aria-label="다음 사진"
                  >
                    <IoChevronForwardOutline size={22} />
                  </button>
                </>
              ) : null}
              <img
                src={photoUrls[previewIndex]}
                alt={photo.title || '조황사진'}
                className="ohgo-photo-lightbox__img"
                onClick={(e) => e.stopPropagation()}
              />
              {photoUrls.length > 1 ? (
                <div className="ohgo-photo-lightbox__counter">
                  {previewIndex + 1} / {photoUrls.length}
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
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

