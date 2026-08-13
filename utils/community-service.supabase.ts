import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  COMMUNITY_POST_DELETED_MESSAGE,
  type CommunityPhoto,
  type Comment,
} from './community-service.shared';
export { COMMUNITY_POST_DELETED_MESSAGE };

const STORAGE_BUCKET = 'photos';

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
  };
}

const PHOTO_LIST_COLUMNS =
  'id, image_urls, uploaded_by, uploaded_by_name, created_at, title, description, content, photo_date, template_id, comment_count';

export async function getPhotos(limitCount?: number): Promise<CommunityPhoto[]> {
  const supabase = getSupabaseBrowserClient();
  let q = supabase
    .from('community_photos')
    .select(PHOTO_LIST_COLUMNS)
    .order('created_at', { ascending: false });
  if (limitCount) q = q.limit(limitCount);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapPhoto(row));
}

export async function getPhoto(photoId: string): Promise<CommunityPhoto | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('community_photos')
    .select('*')
    .eq('id', photoId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPhoto(data) : null;
}

export async function uploadPhoto(
  imageFile: File | File[],
  uploadedBy: string,
  uploadedByName: string,
  title?: string,
  description?: string,
  content?: string,
  photoDate?: Date,
  templateId?: string,
  templateFieldValues?: Record<string, string | string[]>
): Promise<string> {
  const imageFiles = Array.isArray(imageFile) ? imageFile : [imageFile];
  if (imageFiles.length === 0) throw new Error('이미지 파일이 필요합니다.');

  const prefix = `photo_${Date.now()}`;
  const imageUrls = await uploadImageFiles(imageFiles, prefix);

  const row: Record<string, unknown> = {
    uploaded_by: uploadedBy,
    uploaded_by_name: uploadedByName,
    title: title ?? '',
    description: description ?? '',
    image_urls: imageUrls,
    comment_count: 0,
  };
  if (content !== undefined) row.content = content ?? null;
  if (photoDate) row.photo_date = photoDate.toISOString().split('T')[0];
  if (templateId) row.template_id = templateId;
  if (templateFieldValues) row.template_field_values = templateFieldValues;

  const supabase = getSupabaseBrowserClient();
  let { data, error } = await supabase.from('community_photos').insert(row).select('id').single();

  if (error && /template_field_values|uploaded_by_name|photo_date|content/i.test(error.message || '')) {
    const slim = {
      uploaded_by: uploadedBy,
      title: title ?? '',
      description: description ?? '',
      image_urls: imageUrls,
      comment_count: 0,
    };
    ({ data, error } = await supabase.from('community_photos').insert(slim).select('id').single());
  }

  if (error || !data) {
    throw new Error(supabaseErrorMessage(error, '사진 저장 실패'));
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
  }
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

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

  const { error } = await supabase.from('community_photos').update(updateData).eq('id', photoId);
  if (error) throw error;
}

export async function addComment(
  photoId: string,
  userId: string,
  userName: string,
  content: string,
  pointAwarded: number
): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('comments')
    .insert({
      photo_id: photoId,
      user_id: userId,
      user_name: userName,
      content,
      point_awarded: pointAwarded,
    })
    .select('id')
    .single();

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

  return (data ?? []).map((row) => ({
    commentId: row.id,
    userId: row.user_id ?? '',
    userName: row.user_name ?? '',
    content: row.content ?? '',
    createdAt: row.created_at,
    pointAwarded: row.point_awarded ?? 0,
  }));
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

  const { error: deleteError } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('photo_id', photoId);
  if (deleteError) throw deleteError;

  const { data: photo } = await supabase
    .from('community_photos')
    .select('comment_count')
    .eq('id', photoId)
    .single();

  await supabase
    .from('community_photos')
    .update({ comment_count: Math.max(0, (photo?.comment_count ?? 1) - 1) })
    .eq('id', photoId);

  const pointAwarded = comment.point_awarded ?? 0;
  if (pointAwarded > 0 && comment.user_id) {
    return { userId: comment.user_id, pointAwarded };
  }
  return null;
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

export type { CommunityPhoto, Comment };
