import type { NormalizedPost } from './normalize.mts';
import { deriveTitle, findScheduleLikeLines } from './normalize.mts';
import { EXTRACTED_SCHEMA_VERSION } from './schema.mts';
import type { ExtractedImage, ExtractedPost } from './schema.mts';
import type { BandPostRef } from './url.mts';

export function buildExtracted(args: {
  ref: BandPostRef;
  via: 'api' | 'dom';
  post: NormalizedPost;
  images: ExtractedImage[];
  fetchedAt: Date;
  warnings?: string[];
}): ExtractedPost {
  const { ref, via, post, images, fetchedAt } = args;
  const warnings = [...(args.warnings ?? [])];
  if (!post.body) warnings.push('본문이 비어 있습니다');
  if (images.some((img) => img.file === null)) warnings.push('일부 이미지 다운로드에 실패했습니다');

  return {
    schemaVersion: EXTRACTED_SCHEMA_VERSION,
    source: {
      url: ref.canonicalUrl,
      bandId: ref.bandId,
      postId: ref.postId,
      fetchedAt: fetchedAt.toISOString(),
    },
    extractedVia: via,
    author: post.author,
    createdAt: post.createdAt,
    title: deriveTitle(post.body),
    body: post.body,
    images,
    schedules: post.schedules,
    scheduleLikeLines: findScheduleLikeLines(post.body),
    warnings,
  };
}
