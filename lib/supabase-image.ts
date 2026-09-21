const OBJECT_MARKER = '/storage/v1/object/public/';
const RENDER_MARKER = '/storage/v1/render/image/public/';

/** 변환 URL이면 원본 object URL로 되돌립니다. */
export function supabaseOriginalImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const renderIdx = url.indexOf(RENDER_MARKER);
  if (renderIdx !== -1) {
    const origin = url.slice(0, renderIdx);
    const path = url.slice(renderIdx + RENDER_MARKER.length).split('?')[0];
    return `${origin}${OBJECT_MARKER}${path}`;
  }
  if (url.includes(OBJECT_MARKER)) return url.split('?')[0];
  return url;
}

/** 목록·카드용 리사이즈 URL. 변환 실패 시 원본으로 떨어지도록 onError에서 원본을 쓰세요. */
export function supabaseListImageUrl(
  url: string | undefined,
  width = 480,
  resize: 'cover' | 'contain' = 'cover',
): string | undefined {
  if (!url) return undefined;
  const original = supabaseOriginalImageUrl(url) || url;
  const idx = original.indexOf(OBJECT_MARKER);
  if (idx === -1) return original;
  const origin = original.slice(0, idx);
  const path = original.slice(idx + OBJECT_MARKER.length);
  return `${origin}${RENDER_MARKER}${path}?width=${width}&resize=${resize}`;
}
