/** 클라이언트 이미지 리사이즈·JPEG 압축 (업로드 전 용량 축소) */

export type CompressImageOptions = {
  /** 긴 변 최대 픽셀 (기본 1600) */
  maxEdge?: number;
  /** JPEG 품질 0~1 (기본 0.82) */
  quality?: number;
  /** 결과 파일명 */
  fileName?: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    image.src = src;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('이미지 압축에 실패했습니다.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

/** 캔버스 내용을 maxEdge 이하로 줄여 JPEG File로 반환 */
export async function canvasToCompressedFile(
  source: HTMLCanvasElement,
  options: CompressImageOptions = {}
): Promise<File> {
  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.82;
  const fileName = options.fileName ?? `image-${Date.now()}.jpg`;

  let { width, height } = source;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(source, 0, 0, outW, outH);

  const blob = await canvasToJpegBlob(out, quality);
  return new File([blob], fileName, { type: 'image/jpeg' });
}

/** File/Blob을 리사이즈·압축한 JPEG File로 변환 */
export async function compressImageFile(
  input: Blob,
  options: CompressImageOptions = {}
): Promise<File> {
  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.82;
  const fileName =
    options.fileName ??
    (input instanceof File && input.name
      ? input.name.replace(/\.[^.]+$/, '') + '.jpg'
      : `image-${Date.now()}.jpg`);

  const objectUrl = URL.createObjectURL(input);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await canvasToJpegBlob(canvas, quality);
    return new File([blob], fileName, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
