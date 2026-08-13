import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { sendPushToUser } from '@/utils/send-push';
import type {
  CaptainPhoto,
  CaptainPhotoTag,
  PassengerTagInput,
  UploadCaptainPhotoInput,
} from './captain-photo-service.shared';

const STORAGE_BUCKET = 'photos';

function mapTag(row: Record<string, unknown>): CaptainPhotoTag {
  return {
    id: row.id as string,
    photoId: row.photo_id as string,
    userId: (row.user_id as string | null) ?? null,
    userName: (row.user_name as string) ?? '',
    seatNo: row.seat_no != null ? Number(row.seat_no) : undefined,
  };
}

function mapPhoto(row: Record<string, unknown>, tags?: CaptainPhotoTag[]): CaptainPhoto {
  return {
    id: row.id as string,
    captainId: row.captain_id as string,
    imageUrls: (row.image_urls as string[] | null) ?? [],
    species: (row.species as string | null) ?? undefined,
    tripDate: row.trip_date as string,
    createdAt: row.created_at as string,
    tags,
  };
}

async function uploadImages(captainId: string, photoId: string, files: File[]): Promise<string[]> {
  const supabase = getSupabaseBrowserClient();
  const urls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `captain/${captainId}/${photoId}_${Date.now()}_${i}.${ext}`;
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

async function resolveProfileUserId(memberId: string): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.from('profiles').select('id').eq('id', memberId).maybeSingle();
  return data?.id ?? null;
}

export async function getCaptainPhotos(options?: {
  tripDate?: string;
  captainId?: string;
}): Promise<CaptainPhoto[]> {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from('captain_photos')
    .select('*')
    .order('created_at', { ascending: false });

  if (options?.tripDate) query = query.eq('trip_date', options.tripDate);
  if (options?.captainId) query = query.eq('captain_id', options.captainId);

  const { data: photos, error } = await query;
  if (error) throw error;
  if (!photos?.length) return [];

  const photoIds = photos.map((p) => p.id as string);
  const { data: tags, error: tagError } = await supabase
    .from('captain_photo_tags')
    .select('*')
    .in('photo_id', photoIds);

  if (tagError) throw tagError;

  const tagsByPhoto = new Map<string, CaptainPhotoTag[]>();
  for (const row of tags ?? []) {
    const tag = mapTag(row as Record<string, unknown>);
    const list = tagsByPhoto.get(tag.photoId) ?? [];
    list.push(tag);
    tagsByPhoto.set(tag.photoId, list);
  }

  return photos.map((row) =>
    mapPhoto(row as Record<string, unknown>, tagsByPhoto.get(row.id as string))
  );
}

export async function getCaptainPhotoById(photoId: string): Promise<CaptainPhoto | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('captain_photos')
    .select('*')
    .eq('id', photoId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { data: tags } = await supabase
    .from('captain_photo_tags')
    .select('*')
    .eq('photo_id', photoId);

  return mapPhoto(
    data as Record<string, unknown>,
    (tags ?? []).map((t) => mapTag(t as Record<string, unknown>))
  );
}

export async function getPhotosForUser(userId: string): Promise<CaptainPhoto[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: tagRows, error: tagError } = await supabase
    .from('captain_photo_tags')
    .select('photo_id')
    .eq('user_id', userId);

  if (tagError) throw tagError;
  const photoIds = [...new Set((tagRows ?? []).map((r) => r.photo_id as string))];
  if (photoIds.length === 0) return [];

  const { data: photos, error } = await supabase
    .from('captain_photos')
    .select('*')
    .in('id', photoIds)
    .order('trip_date', { ascending: false });

  if (error) throw error;

  const { data: allTags } = await supabase
    .from('captain_photo_tags')
    .select('*')
    .in('photo_id', photoIds)
    .eq('user_id', userId);

  const tagsByPhoto = new Map<string, CaptainPhotoTag[]>();
  for (const row of allTags ?? []) {
    const tag = mapTag(row as Record<string, unknown>);
    const list = tagsByPhoto.get(tag.photoId) ?? [];
    list.push(tag);
    tagsByPhoto.set(tag.photoId, list);
  }

  return (photos ?? []).map((row) =>
    mapPhoto(row as Record<string, unknown>, tagsByPhoto.get(row.id as string))
  );
}

export async function uploadCaptainPhoto(input: UploadCaptainPhotoInput): Promise<CaptainPhoto> {
  const supabase = getSupabaseBrowserClient();
  const photoId = crypto.randomUUID();
  const imageUrls = await uploadImages(input.captainId, photoId, input.files);

  const { data, error } = await supabase
    .from('captain_photos')
    .insert({
      id: photoId,
      captain_id: input.captainId,
      image_urls: imageUrls,
      species: input.species?.trim() || null,
      trip_date: input.tripDate,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapPhoto(data as Record<string, unknown>, []);
}

export async function deleteCaptainPhoto(photoId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('captain_photos').delete().eq('id', photoId);
  if (error) throw error;
}

export async function savePhotoTags(photoId: string, tags: PassengerTagInput[]): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  const { error: deleteError } = await supabase
    .from('captain_photo_tags')
    .delete()
    .eq('photo_id', photoId);
  if (deleteError) throw deleteError;

  if (tags.length === 0) return;

  const finalRows = await Promise.all(
    tags.map(async (tag, index) => {
      const memberId = tag.userId;
      const profileId = memberId ? await resolveProfileUserId(memberId) : null;
      return {
        photo_id: photoId,
        user_id: profileId,
        user_name: tag.userName,
        seat_no: tag.seatNo ?? index + 1,
      };
    })
  );

  const { error: insertError } = await supabase.from('captain_photo_tags').insert(finalRows);
  if (insertError) throw insertError;
}

export async function tagPassengersAndNotify(
  photoId: string,
  tags: PassengerTagInput[],
  options?: { notifyMessage?: string }
): Promise<void> {
  await savePhotoTags(photoId, tags);

  const message =
    options?.notifyMessage ?? '오늘 조황 사진이 등록되었습니다. 내 사진에서 확인해 보세요!';

  for (const tag of tags) {
    if (!tag.userId) continue;
    const profileId = await resolveProfileUserId(tag.userId);
    if (!profileId) continue;

    await sendPushToUser({
      uuid: profileId,
      title: '조황 사진 등록 📸',
      body: message,
      data: { screen: 'my-photos', uuid: profileId },
    });
  }
}
