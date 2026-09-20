/** 작성자 소프트 삭제 시 본문에 표시하는 안내 문구 */
export const COMMUNITY_POST_DELETED_MESSAGE = '작성자가 삭제한 글입니다.';

export type CommunityBoardType = 'photo' | 'qna' | 'faq';

export function parseBoardType(value: unknown): CommunityBoardType {
  if (value === 'qna' || value === 'faq') return value;
  return 'photo';
}

export function communityListPath(board?: CommunityBoardType): string {
  if (board === 'qna') return '/community/qna';
  if (board === 'faq') return '/community/faq';
  return '/community/photos';
}

export function communityWritePath(board?: CommunityBoardType): string {
  if (board === 'qna') return '/community/qna/write';
  if (board === 'faq') return '/community/faq/write';
  return '/community/photos/upload';
}

export function communityBoardTitle(board?: CommunityBoardType): string {
  if (board === 'qna') return '낚시 Q&A';
  if (board === 'faq') return '낚시 팁 · FAQ';
  return '조황 상세';
}

/** FAQ는 관리자만 작성. 조황사진·Q&A는 로그인 사용자 작성 가능. */
export function canWriteCommunityBoard(
  board: CommunityBoardType | undefined,
  user: { isAdmin?: boolean } | null | undefined
): boolean {
  if (!user) return false;
  return board === 'faq' ? Boolean(user.isAdmin) : true;
}

/** 삭제되지 않은 글의 작성자 또는 관리자만 수정. */
export function canEditCommunityPost(
  post: { uploadedBy?: string; isDeleted?: boolean } | null | undefined,
  user: { uuid?: string; isAdmin?: boolean } | null | undefined
): boolean {
  if (!post || !user?.uuid || post.isDeleted) return false;
  return post.uploadedBy === user.uuid || Boolean(user.isAdmin);
}

export interface CommunityPhoto {
  photoId: string;
  imageUrl: string;
  imageUrls?: string[];
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: Date | string;
  title?: string;
  description?: string;
  content?: string;
  photoDate?: Date | string;
  templateId?: string;
  templateFieldValues?: Record<string, string | string[]>;
  commentCount: number;
  /** 작성자 삭제(댓글 유지) 처리된 글 */
  isDeleted?: boolean;
  boardType?: CommunityBoardType;
  acceptedCommentId?: string;
  category?: string;
  isNotice?: boolean;
}

export function sortBoardList<T extends { isNotice?: boolean; uploadedAt: Date | string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pin = Number(Boolean(b.isNotice)) - Number(Boolean(a.isNotice));
    if (pin !== 0) return pin;
    return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
  });
}

export interface Comment {
  commentId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date | string;
  pointAwarded: number;
  parentId?: string;
  isAccepted?: boolean;
}
