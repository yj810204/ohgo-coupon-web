import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getSettingsValue, setSettingsValue } from '@/lib/settings-store';
import { awardQnaAcceptedPoints, deductCommentPoints } from './community-point-service';
import { sendPushToUser } from './send-push';
import { resolveAppUser } from '@/lib/auth-session';
import {
  COMMUNITY_POST_DELETED_MESSAGE,
  parseBoardType,
  sortBoardList,
  type CommunityBoardType,
  type CommunityPhoto,
  type Comment,
} from './community-service.shared';
export { COMMUNITY_POST_DELETED_MESSAGE };

const STORAGE_BUCKET = 'photos';
const NOTICE_IDS_KEY = 'community_notice_ids';

async function getNoticeIdSet(): Promise<Set<string>> {
  const ids = await getSettingsValue<string[]>(NOTICE_IDS_KEY, []);
  return new Set(Array.isArray(ids) ? ids : []);
}

async function setNoticeFlag(photoId: string, isNotice: boolean): Promise<void> {
  const next = await getNoticeIdSet();
  if (isNotice) next.add(photoId);
  else next.delete(photoId);
  await setSettingsValue(NOTICE_IDS_KEY, [...next]);
}

async function applyNoticeFlags(photos: CommunityPhoto[]): Promise<CommunityPhoto[]> {
  const notices = await getNoticeIdSet();
  if (notices.size === 0) return sortBoardList(photos);
  return sortBoardList(
    photos.map((photo) => (notices.has(photo.photoId) ? { ...photo, isNotice: true } : photo))
  );
}

function extractStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}

async function deleteStorageImages(imageUrls: string[]): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const paths = imageUrls
    .map(extractStoragePath)
    .filter((p): p is string => Boolean(p));

  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) {
    console.warn('Storage image delete failed:', error);
  }
}

const PARENT_MARK = /^<!--ohgo-parent:([0-9a-fA-F-]{36})-->\n?/;

function parseCommentContent(raw: string): { content: string; parentId?: string } {
  const m = raw.match(PARENT_MARK);
  if (!m) return { content: raw };
  return { content: raw.slice(m[0].length), parentId: m[1] };
}

function encodeCommentContent(content: string, parentId?: string): string {
  if (!parentId) return content;
  return `<!--ohgo-parent:${parentId}-->\n${content}`;
}

function supabaseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

async function uploadImageFiles(files: File[], idPrefix: string): Promise<string[]> {
  const urls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const form = new FormData();
    form.append('file', file);
    form.append('prefix', `${idPrefix}_${i}`);
    const res = await fetch('/api/community/upload-photo', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    let json: { success?: boolean; message?: string; imageUrl?: string } = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }
    if (!res.ok || !json.success || !json.imageUrl) {
      throw new Error(json.message || '이미지 업로드에 실패했습니다.');
    }
    urls.push(json.imageUrl);
  }

  return urls;
}

function mapPhoto(row: Record<string, unknown>): CommunityPhoto {
  const imageUrls = (row.image_urls as string[] | null) ?? undefined;
  const description = (row.description as string) ?? '';
  const content = row.content as string | undefined;
  const markedDeleted =
    row.is_deleted === true ||
    description === COMMUNITY_POST_DELETED_MESSAGE ||
    content === COMMUNITY_POST_DELETED_MESSAGE;
  return {
    photoId: row.id as string,
    imageUrl: imageUrls?.[0] ?? '',
    imageUrls,
    uploadedBy: (row.uploaded_by as string) ?? '',
    uploadedByName: (row.uploaded_by_name as string) ?? '',
    uploadedAt: row.created_at as string,
    title: (row.title as string) ?? '',
    description,
    content,
    photoDate: row.photo_date as string | undefined,
    templateId: row.template_id as string | undefined,
    templateFieldValues: row.template_field_values as Record<string, string | string[]> | undefined,
    commentCount: (row.comment_count as number) ?? 0,
    isDeleted: markedDeleted,
    boardType: parseBoardType(row.board_type),
    acceptedCommentId: (row.accepted_comment_id as string) || undefined,
    category: typeof row.category === 'string' && row.category.trim() ? row.category.trim() : undefined,
    isNotice: row.is_notice === true,
  };
}

const PHOTO_LIST_COLUMNS =
  'id, image_urls, uploaded_by, uploaded_by_name, created_at, title, description, content, photo_date, template_id, comment_count, board_type, accepted_comment_id, category, is_notice';

export async function getPhotos(
  limitCount?: number,
  boardType: CommunityBoardType = 'photo'
): Promise<CommunityPhoto[]> {
  const supabase = getSupabaseBrowserClient();
  let q = supabase
    .from('community_photos')
    .select(PHOTO_LIST_COLUMNS)
    .eq('board_type', boardType)
    .order('is_notice', { ascending: false })
    .order('created_at', { ascending: false });
  if (limitCount) q = q.limit(limitCount);

  let { data, error } = await q;
  if (error && /is_notice/i.test(error.message || '')) {
    let retry = supabase
      .from('community_photos')
      .select(
        'id, image_urls, uploaded_by, uploaded_by_name, created_at, title, description, content, photo_date, template_id, comment_count, board_type, accepted_comment_id, category'
      )
      .eq('board_type', boardType)
      .order('created_at', { ascending: false });
    if (limitCount) retry = retry.limit(limitCount);
    ({ data, error } = await retry);
  }
  if (error && /category/i.test(error.message || '')) {
    let retry = supabase
      .from('community_photos')
      .select(
        'id, image_urls, uploaded_by, uploaded_by_name, created_at, title, description, content, photo_date, template_id, comment_count, board_type, accepted_comment_id'
      )
      .eq('board_type', boardType)
      .order('created_at', { ascending: false });
    if (limitCount) retry = retry.limit(limitCount);
    ({ data, error } = await retry);
  }
  if (error && /accepted_comment_id/i.test(error.message || '')) {
    let retry = supabase
      .from('community_photos')
      .select(
        'id, image_urls, uploaded_by, uploaded_by_name, created_at, title, description, content, photo_date, template_id, comment_count, board_type'
      )
      .eq('board_type', boardType)
      .order('created_at', { ascending: false });
    if (limitCount) retry = retry.limit(limitCount);
    ({ data, error } = await retry);
  }
  if (error && /board_type/i.test(error.message || '')) {
    if (boardType !== 'photo') return [];
    let fallback = supabase
      .from('community_photos')
      .select(
        'id, image_urls, uploaded_by, uploaded_by_name, created_at, title, description, content, photo_date, template_id, comment_count'
      )
      .order('created_at', { ascending: false });
    if (limitCount) fallback = fallback.limit(limitCount);
    ({ data, error } = await fallback);
  }
  if (error) throw error;
  return applyNoticeFlags((data ?? []).map((row: Record<string, unknown>) => mapPhoto(row)));
}

export async function getPhotosByUser(userId: string): Promise<CommunityPhoto[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('community_photos')
    .select(PHOTO_LIST_COLUMNS)
    .eq('uploaded_by', userId)
    .order('is_notice', { ascending: false })
    .order('created_at', { ascending: false });
  if (error && /is_notice|category|accepted_comment_id|board_type/i.test(error.message || '')) {
    const { data: retryData, error: retryError } = await supabase
      .from('community_photos')
      .select(
        'id, image_urls, uploaded_by, uploaded_by_name, created_at, title, description, content, photo_date, template_id, comment_count'
      )
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false });
    if (retryError) throw retryError;
    return applyNoticeFlags((retryData ?? []).map((row: Record<string, unknown>) => mapPhoto(row)));
  }
  if (error) throw error;
  return applyNoticeFlags((data ?? []).map((row: Record<string, unknown>) => mapPhoto(row)));
}

export async function countPhotos(boardType: CommunityBoardType = 'photo'): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { count, error } = await supabase
    .from('community_photos')
    .select('id', { count: 'exact', head: true })
    .eq('board_type', boardType);
  if (error && /board_type/i.test(error.message || '')) {
    if (boardType !== 'photo') return 0;
    const fallback = await supabase.from('community_photos').select('id', { count: 'exact', head: true });
    if (fallback.error) throw fallback.error;
    return fallback.count ?? 0;
  }
  if (error) throw error;
  return count ?? 0;
}

export async function getPhoto(photoId: string): Promise<CommunityPhoto | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('community_photos')
    .select('*')
    .eq('id', photoId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const [photo] = await applyNoticeFlags([mapPhoto(data)]);
  return photo;
}

export async function uploadPhoto(
  imageFile: File | File[] | undefined,
  uploadedBy: string,
  uploadedByName: string,
  title?: string,
  description?: string,
  content?: string,
  photoDate?: Date,
  templateId?: string,
  templateFieldValues?: Record<string, string | string[]>,
  boardType: CommunityBoardType = 'photo',
  category?: string,
  isNotice?: boolean
): Promise<string> {
  const imageFiles = Array.isArray(imageFile) ? imageFile : imageFile ? [imageFile] : [];
  if (boardType === 'photo' && imageFiles.length === 0) {
    throw new Error('이미지 파일이 필요합니다.');
  }

  const prefix = `photo_${Date.now()}`;
  const imageUrls = imageFiles.length > 0 ? await uploadImageFiles(imageFiles, prefix) : [];

  const row: Record<string, unknown> = {
    uploaded_by: uploadedBy,
    uploaded_by_name: uploadedByName,
    title: title ?? '',
    description: description ?? '',
    image_urls: imageUrls.length > 0 ? imageUrls : null,
    comment_count: 0,
    board_type: boardType,
  };
  if (category) row.category = category;
  if (isNotice) row.is_notice = true;
  if (content !== undefined) row.content = content ?? null;
  if (photoDate) row.photo_date = photoDate.toISOString().split('T')[0];
  if (templateId) row.template_id = templateId;
  if (templateFieldValues) row.template_field_values = templateFieldValues;

  const supabase = getSupabaseBrowserClient();
  let { data, error } = await supabase.from('community_photos').insert(row).select('id').single();

  if (error && /template_field_values|uploaded_by_name|photo_date|content|board_type|category|is_notice/i.test(error.message || '')) {
    const slim = {
      uploaded_by: uploadedBy,
      title: title ?? '',
      description: description ?? '',
      image_urls: imageUrls.length > 0 ? imageUrls : null,
      comment_count: 0,
    };
    ({ data, error } = await supabase.from('community_photos').insert(slim).select('id').single());
  }

  if (error || !data) {
    throw new Error(supabaseErrorMessage(error, '사진 저장 실패'));
  }
  if (isNotice) {
    try {
      await setNoticeFlag(data.id, true);
    } catch (noticeError) {
      console.warn('notice flag save failed:', noticeError);
    }
  }
  return data.id;
}

export async function updatePhoto(
  photoId: string,
  updates: {
    title?: string;
    description?: string;
    content?: string;
    photoDate?: Date;
    templateId?: string;
    templateFieldValues?: Record<string, string | string[]>;
    imageFile?: File | File[];
    imageUrls?: string[];
    category?: string;
    isNotice?: boolean;
  }
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.category !== undefined) updateData.category = updates.category || null;
  if (updates.isNotice !== undefined) updateData.is_notice = updates.isNotice;
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.content !== undefined) updateData.content = updates.content;
  if (updates.photoDate !== undefined) {
    updateData.photo_date = updates.photoDate
      ? updates.photoDate.toISOString().split('T')[0]
      : null;
  }
  if (updates.templateId !== undefined) updateData.template_id = updates.templateId;
  if (updates.templateFieldValues !== undefined) {
    updateData.template_field_values = updates.templateFieldValues;
  }

  const allImageUrls: string[] = [...(updates.imageUrls ?? [])];

  if (updates.imageFile) {
    const uploaded = await uploadImageFiles(
      Array.isArray(updates.imageFile) ? updates.imageFile : [updates.imageFile],
      photoId
    );
    allImageUrls.push(...uploaded);
  }

  if (allImageUrls.length > 0) {
    updateData.image_urls = allImageUrls;
  }

  let { error } = await supabase.from('community_photos').update(updateData).eq('id', photoId);
  if (error && /is_notice/i.test(error.message || '')) {
    delete updateData.is_notice;
    ({ error } = await supabase.from('community_photos').update(updateData).eq('id', photoId));
  }
  if (error) throw error;
  if (updates.isNotice !== undefined) {
    try {
      await setNoticeFlag(photoId, updates.isNotice);
    } catch (noticeError) {
      console.warn('notice flag save failed:', noticeError);
    }
  }
}

export async function addComment(
  photoId: string,
  userId: string,
  userName: string,
  content: string,
  pointAwarded: number,
  parentId?: string
): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const storedContent = encodeCommentContent(content, parentId);
  const baseRow = {
    photo_id: photoId,
    user_id: userId,
    user_name: userName,
    content: storedContent,
    point_awarded: pointAwarded,
  };
  let { data, error } = await supabase
    .from('comments')
    .insert(parentId ? { ...baseRow, parent_id: parentId } : baseRow)
    .select('id')
    .single();

  if (error && parentId) {
    ({ data, error } = await supabase.from('comments').insert(baseRow).select('id').single());
  }

  if (error || !data) throw error ?? new Error('댓글 저장 실패');

  const { data: photo } = await supabase
    .from('community_photos')
    .select('comment_count')
    .eq('id', photoId)
    .single();

  await supabase
    .from('community_photos')
    .update({ comment_count: (photo?.comment_count ?? 0) + 1 })
    .eq('id', photoId);

  return data.id;
}

export async function updateCommentPoints(
  photoId: string,
  commentId: string,
  pointAwarded: number
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('comments')
    .update({ point_awarded: pointAwarded })
    .eq('id', commentId)
    .eq('photo_id', photoId);
  if (error) throw error;
}

export async function getComments(photoId: string): Promise<Comment[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('photo_id', photoId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const parsed = parseCommentContent(row.content ?? '');
    return {
      commentId: row.id,
      userId: row.user_id ?? '',
      userName: row.user_name ?? '',
      content: parsed.content,
      createdAt: row.created_at,
      pointAwarded: row.point_awarded ?? 0,
      parentId: row.parent_id || parsed.parentId || undefined,
      isAccepted: row.is_accepted === true,
    };
  });
}

export async function updateComment(
  photoId: string,
  commentId: string,
  content: string
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data: existing, error: fetchError } = await supabase
    .from('comments')
    .select('content, parent_id')
    .eq('id', commentId)
    .eq('photo_id', photoId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) throw new Error('댓글을 찾을 수 없습니다.');

  const parsed = parseCommentContent(existing.content ?? '');
  const parentId = existing.parent_id || parsed.parentId;
  const { error } = await supabase
    .from('comments')
    .update({ content: encodeCommentContent(content, parentId) })
    .eq('id', commentId)
    .eq('photo_id', photoId);
  if (error) throw error;
}

export async function deleteComment(
  photoId: string,
  commentId: string
): Promise<{ userId: string; pointAwarded: number } | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: comment, error: fetchError } = await supabase
    .from('comments')
    .select('user_id, point_awarded')
    .eq('id', commentId)
    .eq('photo_id', photoId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!comment) throw new Error('댓글을 찾을 수 없습니다.');

  const { data: siblings } = await supabase
    .from('comments')
    .select('id, content, parent_id')
    .eq('photo_id', photoId);

  const childIds = (siblings ?? [])
    .filter((row) => {
      if (row.id === commentId) return false;
      if (row.parent_id === commentId) return true;
      return parseCommentContent(row.content ?? '').parentId === commentId;
    })
    .map((row) => row.id);

  if (childIds.length > 0) {
    await supabase.from('comments').delete().eq('photo_id', photoId).in('id', childIds);
  }

  const { error: deleteError } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('photo_id', photoId);
  if (deleteError) throw deleteError;

  const removed = 1 + childIds.length;
  const { data: photo } = await supabase
    .from('community_photos')
    .select('comment_count, accepted_comment_id')
    .eq('id', photoId)
    .single();

  const acceptedCleared =
    photo?.accepted_comment_id === commentId || childIds.includes(photo?.accepted_comment_id ?? '');
  await supabase
    .from('community_photos')
    .update({
      comment_count: Math.max(0, (photo?.comment_count ?? removed) - removed),
      ...(acceptedCleared ? { accepted_comment_id: null } : {}),
    })
    .eq('id', photoId);

  const pointAwarded = comment.point_awarded ?? 0;
  if (pointAwarded > 0 && comment.user_id) {
    return { userId: comment.user_id, pointAwarded };
  }
  return null;
}

export async function acceptQnaAnswer(
  photoId: string,
  commentId: string
): Promise<{ awarded: number; alreadyAccepted: boolean }> {
  const actor = await resolveAppUser();
  if (!actor?.isAdmin) {
    throw new Error('관리자만 답변을 선정할 수 있습니다.');
  }

  const photo = await getPhoto(photoId);
  if (!photo || photo.boardType !== 'qna') {
    throw new Error('Q&A 게시글만 답변을 선정할 수 있습니다.');
  }

  const comments = await getComments(photoId);
  const target = comments.find((item) => item.commentId === commentId);
  if (!target) throw new Error('답변을 찾을 수 없습니다.');
  if (target.parentId) throw new Error('답글은 선정할 수 없습니다.');
  if (target.isAccepted || photo.acceptedCommentId === commentId) {
    return { awarded: 0, alreadyAccepted: true };
  }

  const supabase = getSupabaseBrowserClient();
  const previous = comments.find((item) => item.isAccepted || item.commentId === photo.acceptedCommentId);

  if (previous && previous.commentId !== commentId) {
    await supabase.from('comments').update({ is_accepted: false }).eq('id', previous.commentId);
    if (previous.pointAwarded > 0 && previous.userId) {
      await deductCommentPoints(previous.userId, previous.pointAwarded);
      await updateCommentPoints(photoId, previous.commentId, 0);
    }
  }

  const { error: commentError } = await supabase
    .from('comments')
    .update({ is_accepted: true })
    .eq('id', commentId)
    .eq('photo_id', photoId);
  if (commentError && !/is_accepted/i.test(commentError.message || '')) throw commentError;

  const { error: photoError } = await supabase
    .from('community_photos')
    .update({ accepted_comment_id: commentId, updated_at: new Date().toISOString() })
    .eq('id', photoId);
  if (photoError) throw photoError;

  const result = await awardQnaAcceptedPoints(target.userId, commentId, photo.uploadedBy);
  if (result.points > 0) {
    await updateCommentPoints(photoId, commentId, result.points);
  }

  if (target.userId) {
    const title = photo.title?.trim() || '질문';
    void sendPushToUser({
      uuid: target.userId,
      title: '답변이 선정되었습니다',
      body:
        result.points > 0
          ? `'${title}'에 남긴 답변이 선정되어 ${result.points}포인트가 적립되었습니다.`
          : `'${title}'에 남긴 답변이 선정되었습니다.`,
      data: { screen: 'community' },
    });
  }

  return { awarded: result.points, alreadyAccepted: false };
}

export type DeletePhotoResult = { mode: 'hard' | 'soft' };

export async function deletePhoto(
  photoId: string,
  options?: { mode?: 'hard' | 'soft' }
): Promise<DeletePhotoResult> {
  const mode = options?.mode === 'soft' ? 'soft' : 'hard';
  const res = await fetch('/api/community/delete-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId, mode }),
  });
  const data = (await res.json().catch(() => null)) as
    | { success?: boolean; message?: string; mode?: 'hard' | 'soft' }
    | null;
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || '게시글 삭제에 실패했습니다.');
  }
  return { mode: data.mode === 'soft' ? 'soft' : 'hard' };
}

export type { CommunityPhoto, Comment, CommunityBoardType };
