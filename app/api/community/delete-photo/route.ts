import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { COMMUNITY_POST_DELETED_MESSAGE } from '@/utils/community-service.shared';

const BUCKET = 'photos';

function extractStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}

type DeleteBody = {
  photoId?: string;
  /** hard: 게시글+댓글 완전 삭제 / soft: 본문만 삭제 표시, 댓글 유지 */
  mode?: 'hard' | 'soft';
};

export async function POST(request: NextRequest) {
  try {
    type CookieEntry = {
      name: string;
      value: string;
      options?: Parameters<NextResponse['cookies']['set']>[2];
    };
    const pendingCookies: CookieEntry[] = [];

    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              pendingCookies.push({ name, value, options });
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as DeleteBody | null;
    const photoId = body?.photoId?.trim();
    const mode = body?.mode === 'soft' ? 'soft' : 'hard';
    if (!photoId) {
      return NextResponse.json({ success: false, message: 'photoId가 필요합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();

    let photo: {
      id: string;
      uploaded_by: string | null;
      image_urls: string[] | null;
      comment_count: number | null;
      is_deleted?: boolean | null;
    } | null = null;

    {
      const withFlag = await admin
        .from('community_photos')
        .select('id, uploaded_by, image_urls, comment_count, is_deleted')
        .eq('id', photoId)
        .maybeSingle();
      if (withFlag.error && /is_deleted/i.test(withFlag.error.message || '')) {
        const fallback = await admin
          .from('community_photos')
          .select('id, uploaded_by, image_urls, comment_count')
          .eq('id', photoId)
          .maybeSingle();
        if (fallback.error) throw fallback.error;
        photo = fallback.data;
      } else if (withFlag.error) {
        throw withFlag.error;
      } else {
        photo = withFlag.data;
      }
    }

    if (!photo) {
      return NextResponse.json({ success: false, message: '게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const isAdmin = profile?.role === 'admin';
    const isOwner = photo.uploaded_by === user.id;
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ success: false, message: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    // 작성자는 hard 삭제를 댓글이 없을 때만 허용 (댓글 있으면 soft만)
    const commentCount = Number(photo.comment_count ?? 0);
    if (!isAdmin && mode === 'hard' && commentCount > 0) {
      return NextResponse.json(
        { success: false, message: '댓글이 있는 글은 완전 삭제할 수 없습니다.' },
        { status: 400 }
      );
    }

    const imageUrls = (photo.image_urls as string[] | null) ?? [];
    const paths = imageUrls
      .map(extractStoragePath)
      .filter((p): p is string => Boolean(p));

    if (mode === 'soft') {
      if (paths.length > 0) {
        const { error: storageError } = await admin.storage.from(BUCKET).remove(paths);
        if (storageError) {
          console.warn('[delete-photo] storage remove failed:', storageError);
        }
      }

      const softPayload = {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        title: '',
        description: COMMUNITY_POST_DELETED_MESSAGE,
        content: COMMUNITY_POST_DELETED_MESSAGE,
        image_urls: [] as string[],
        template_id: null,
        template_field_values: null,
        updated_at: new Date().toISOString(),
      };

      let softError = (
        await admin.from('community_photos').update(softPayload).eq('id', photoId)
      ).error;

      // 마이그레이션 전 DB 호환: is_deleted 컬럼 없으면 본문만 갱신
      if (softError && /is_deleted|deleted_at/i.test(softError.message || '')) {
        softError = (
          await admin
            .from('community_photos')
            .update({
              title: '',
              description: COMMUNITY_POST_DELETED_MESSAGE,
              content: COMMUNITY_POST_DELETED_MESSAGE,
              image_urls: [],
              template_id: null,
              template_field_values: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', photoId)
        ).error;
      }

      if (softError) throw softError;

      const response = NextResponse.json({ success: true, mode: 'soft' });
      pendingCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    }

    // hard: 댓글 + 이미지 + 게시글
    const { error: commentsError } = await admin.from('comments').delete().eq('photo_id', photoId);
    if (commentsError) throw commentsError;

    if (paths.length > 0) {
      const { error: storageError } = await admin.storage.from(BUCKET).remove(paths);
      if (storageError) {
        console.warn('[delete-photo] storage remove failed:', storageError);
      }
    }

    const { error: deleteError } = await admin.from('community_photos').delete().eq('id', photoId);
    if (deleteError) throw deleteError;

    const response = NextResponse.json({ success: true, mode: 'hard' });
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  } catch (error) {
    console.error('[delete-photo]', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : '게시글 삭제 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
