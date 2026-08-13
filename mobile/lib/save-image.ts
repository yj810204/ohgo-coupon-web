import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

export type SaveImagePayload = {
  /** 원격/로컬 파일 URI (http(s) 또는 file://) */
  uri?: string;
  /** data URL 없이 raw base64 (blob 이미지용) */
  base64?: string;
  filename?: string;
  mimeType?: string;
};

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\u3131-\u318E\uAC00-\uD7A3-]+/g, '_');
  return cleaned.endsWith('.jpg') || cleaned.endsWith('.jpeg') || cleaned.endsWith('.png')
    ? cleaned
    : `${cleaned}.jpg`;
}

export async function saveImageToLibrary(payload: SaveImagePayload): Promise<void> {
  const filename = sanitizeFilename(payload.filename || `ohgo_roster_${Date.now()}.jpg`);
  const target = `${FileSystem.cacheDirectory}${filename}`;

  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error('사진 앨범 저장 권한이 필요합니다. 설정에서 허용해 주세요.');
  }

  if (payload.base64) {
    const raw = payload.base64.replace(/^data:image\/\w+;base64,/, '');
    await FileSystem.writeAsStringAsync(target, raw, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } else if (payload.uri) {
    if (payload.uri.startsWith('file://')) {
      await MediaLibrary.saveToLibraryAsync(payload.uri);
      return;
    }
    const result = await FileSystem.downloadAsync(payload.uri, target);
    if (result.status !== 200) {
      throw new Error('이미지를 내려받지 못했습니다.');
    }
  } else {
    throw new Error('저장할 이미지 정보가 없습니다.');
  }

  await MediaLibrary.saveToLibraryAsync(target);
}
