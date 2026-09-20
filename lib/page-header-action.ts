import { IoAddOutline, IoCreateOutline } from 'react-icons/io5';
import type { IconType } from 'react-icons';
import {
  canEditCommunityPost,
  canWriteCommunityBoard,
  communityWritePath,
  type CommunityBoardType,
} from '@/utils/community-service.shared';

export type PageHeaderAction = {
  ariaLabel: string;
  onClick: () => void;
  icon: IconType;
};

export function writeHeaderAction(onClick: () => void, ariaLabel = '글쓰기'): PageHeaderAction {
  return { ariaLabel, onClick, icon: IoAddOutline };
}

export function editHeaderAction(onClick: () => void, ariaLabel = '수정'): PageHeaderAction {
  return { ariaLabel, onClick, icon: IoCreateOutline };
}

function writeLabel(board?: CommunityBoardType): string {
  if (board === 'qna') return '질문하기';
  if (board === 'faq') return '팁 등록';
  return '글쓰기';
}

/** 내 글(또는 관리자) → 수정, 작성 가능 게시판 → 글쓰기, 그 외는 undefined(마이페이지 폴백). */
export function communityPageHeaderAction(options: {
  board?: CommunityBoardType;
  user: { uuid?: string; isAdmin?: boolean } | null | undefined;
  post?: { photoId: string; uploadedBy: string; isDeleted?: boolean } | null;
  onNavigate: (path: string) => void;
}): PageHeaderAction | undefined {
  const { board, user, post, onNavigate } = options;
  if (post && canEditCommunityPost(post, user)) {
    return editHeaderAction(() =>
      onNavigate(`${communityWritePath(board)}?photoId=${encodeURIComponent(post.photoId)}`)
    );
  }
  if (canWriteCommunityBoard(board, user)) {
    return writeHeaderAction(() => onNavigate(communityWritePath(board)), writeLabel(board));
  }
  return undefined;
}
