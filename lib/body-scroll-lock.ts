/**
 * 중첩 모달/시트에서 overflow:hidden 이 남는 일을 막기 위한 참조 카운트 잠금.
 */

let lockCount = 0;
let prevBodyOverflow = '';
let prevHtmlOverflow = '';

function canUseDom(): boolean {
  return typeof document !== 'undefined';
}

export function hasOpenOhgoModal(): boolean {
  if (!canUseDom()) return false;
  return Boolean(document.querySelector('.ohgo-modal-backdrop'));
}

export function lockBodyScroll(): void {
  if (!canUseDom()) return;
  if (lockCount === 0) {
    prevBodyOverflow = document.body.style.overflow;
    prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.setAttribute('data-ohgo-modal-open', 'true');
  }
  lockCount += 1;
}

export function unlockBodyScroll(): void {
  if (!canUseDom()) return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;
  if (prevBodyOverflow) document.body.style.overflow = prevBodyOverflow;
  else document.body.style.removeProperty('overflow');
  if (prevHtmlOverflow) document.documentElement.style.overflow = prevHtmlOverflow;
  else document.documentElement.style.removeProperty('overflow');
  document.body.removeAttribute('data-ohgo-modal-open');
  prevBodyOverflow = '';
  prevHtmlOverflow = '';
}

/** 경로 이동·백그라운드 복귀 시 남은 잠금 강제 해제 */
export function forceUnlockBodyScroll(): void {
  lockCount = 0;
  prevBodyOverflow = '';
  prevHtmlOverflow = '';
  if (!canUseDom()) return;
  document.body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  document.body.removeAttribute('data-ohgo-modal-open');
}

export function releaseBodyScrollIfIdle(): void {
  if (hasOpenOhgoModal()) return;
  forceUnlockBodyScroll();
}
