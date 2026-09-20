const STORAGE_KEY = 'ohgo-roster-preview-image';

export function storeRosterPreviewImage(dataUrl: string) {
  sessionStorage.setItem(STORAGE_KEY, dataUrl);
}

export function loadRosterPreviewImage(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
