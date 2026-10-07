export type BandPostRef = {
  bandId: string;
  postId: string;
  canonicalUrl: string;
};

const BAND_HOSTS = new Set(['band.us', 'www.band.us', 'm.band.us']);
const POST_PATH = /^\/band\/(\d+)\/post\/(\d+)\/?$/;

export function parseBandPostUrl(input: string): BandPostRef {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`URL 형식이 아닙니다: ${input}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`http(s) URL이 아닙니다: ${input}`);
  }
  if (!BAND_HOSTS.has(url.hostname)) {
    throw new Error(`band.us 게시글 URL이 아닙니다: ${input}`);
  }
  const match = POST_PATH.exec(url.pathname);
  if (!match) {
    throw new Error(`게시글 경로(/band/{bandId}/post/{postId})가 아닙니다: ${input}`);
  }
  const [, bandId, postId] = match;
  return {
    bandId,
    postId,
    canonicalUrl: `https://band.us/band/${bandId}/post/${postId}`,
  };
}
