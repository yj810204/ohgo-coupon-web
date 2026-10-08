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
  /** # 없이 저장한 조황 태그 */
  hashtags?: string[];
}

/** `#조황 #이벤트` 또는 쉼표로 나뉜 입력을 태그 이름으로 만든다 */
export function parseHashtagInput(raw: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,，]+/)) {
    const tag = part.replace(/^\[+/, '').replace(/\]+$/, '').replace(/^#+/, '').trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

export function formatHashtags(tags: string[] | undefined): string {
  return (tags ?? [])
    .map((tag) => tag.replace(/^#+/, '').trim())
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(' ');
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
