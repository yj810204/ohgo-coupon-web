import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { CommunityPhoto, Comment } from './community-service.shared';

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

async function uploadImageFiles(files: File[], idPrefix: string): Promise<string[]> {
  const supabase = getSupabaseBrowserClient();
  const urls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `community/photos/${idPrefix}_${Date.now()}_${i}.${ext}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) throw error;
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

function mapPhoto(row: Record<string, unknown>): CommunityPhoto {
  const imageUrls = (row.image_urls as string[] | null) ?? undefined;
  return {
    photoId: row.id as string,
    imageUrl: imageUrls?.[0] ?? '',
    imageUrls,
    uploadedBy: (row.uploaded_by as string) ?? '',
    uploadedByName: (row.uploaded_by_name as string) ?? '',
    uploadedAt: row.created_at as string,
    title: (row.title as string) ?? '',
    description: (row.description as string) ?? '',
    content: row.content as string | undefined,
    photoDate: row.photo_date as string | undefined,
    templateId: row.template_id as string | undefined,
    templateFieldValues: row.template_field_values as Record<string, string | string[]> | undefined,
    commentCount: (row.comment_count as number) ?? 0,
  };
}

export async function getPhotos(limitCount?: number): Promise<CommunityPhoto[]> {
  const supabase = getSupabaseBrowserClient();
  let q = supabase.from('community_photos').select('*').order('created_at', { ascending: false });
  if (limitCount) q = q.limit(limitCount);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row) => mapPhoto(row));
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

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('community_photos')
    .insert({
      uploaded_by: uploadedBy,
      uploaded_by_name: uploadedByName,
      title: title ?? '',
      description: description ?? '',
      content: content ?? null,
      image_urls: imageUrls,
      photo_date: photoDate ? photoDate.toISOString().split('T')[0] : null,
      template_id: templateId ?? null,
      template_field_values: templateFieldValues ?? null,
      comment_count: 0,
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('사진 저장 실패');
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

export async function deletePhoto(photoId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  const { data: photo, error: fetchError } = await supabase
    .from('community_photos')
    .select('image_urls')
    .eq('id', photoId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const imageUrls = (photo?.image_urls as string[] | null) ?? [];
  if (imageUrls.length > 0) {
    await deleteStorageImages(imageUrls);
  }

  const { error: commentsError } = await supabase.from('comments').delete().eq('photo_id', photoId);
  if (commentsError) throw commentsError;

  const { error } = await supabase.from('community_photos').delete().eq('id', photoId);
  if (error) throw error;
}

export type { CommunityPhoto, Comment };
