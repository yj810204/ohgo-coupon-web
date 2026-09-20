export function maskAuthorName(name: string | undefined): string {
  const t = (name || '').trim();
  if (!t) return '';
  if (t.length === 1) return t;
  return `${t[0]}**`;
}

export function displayMemberName(
  name: string | undefined,
  canSeeFullNames: boolean
): string {
  if (canSeeFullNames) return (name || '').trim();
  return maskAuthorName(name);
}

export function formatPhotoCardDate(date: Date | string | undefined): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(String(date));
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}
