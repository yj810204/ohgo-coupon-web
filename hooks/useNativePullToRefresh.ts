'use client';

import { useEffect, useRef } from 'react';

const PULL_THRESHOLD = 72;
const EVENT_NAME = 'ohgo-pull-refresh';

function getScrollTop(): number {
  return (
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

function isUiLocked(): boolean {
  return (
    document.body.getAttribute('data-ohgo-modal-open') === 'true' ||
    document.body.getAttribute('data-game-playing') === 'true' ||
    Boolean(document.querySelector('.ohgo-modal-backdrop'))
  );
}

function isInsideScrollable(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    if (
      ((overflowY === 'auto' || overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight + 1) ||
      ((overflowX === 'auto' || overflowX === 'scroll') &&
        node.scrollWidth > node.clientWidth + 1)
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function ensureIndicator(): void {
  if (document.getElementById('ohgo-ptr-indicator')) return;
  const el = document.createElement('div');
  el.id = 'ohgo-ptr-indicator';
  el.className = 'ohgo-ptr-indicator';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="ohgo-ptr-indicator__spinner"></div>';
  document.body.appendChild(el);
}

let gestureInstalled = false;
let gestureRefCount = 0;

function installDocumentPullGesture(): () => void {
  gestureRefCount += 1;
  if (gestureInstalled) {
    return () => {
      gestureRefCount = Math.max(0, gestureRefCount - 1);
    };
  }
  gestureInstalled = true;

  let startY = 0;
  let lastY = 0;
  let pulling = false;
  let refreshing = false;

  const resetPullUi = () => {
    document.body.classList.remove('ohgo-ptr-active');
    document.body.style.removeProperty('--ohgo-ptr-pull');
    pulling = false;
    startY = 0;
    lastY = 0;
  };

  const onTouchStart = (e: TouchEvent) => {
    if (refreshing || isUiLocked() || isInsideScrollable(e.target)) {
      startY = 0;
      return;
    }
    if (getScrollTop() > 2) {
      startY = 0;
      return;
    }
    startY = e.touches[0]?.clientY ?? 0;
    lastY = startY;
    pulling = false;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (refreshing || startY <= 0 || isUiLocked()) return;
    if (isInsideScrollable(e.target) || getScrollTop() > 2) {
      resetPullUi();
      return;
    }

    lastY = e.touches[0]?.clientY ?? lastY;
    const dy = lastY - startY;
    if (dy <= 8) return;

    pulling = true;
    ensureIndicator();
    document.body.classList.add('ohgo-ptr-active');
    document.body.style.setProperty('--ohgo-ptr-pull', `${Math.min(dy * 0.45, 96)}px`);

    // 확실한 당김일 때만 네이티브 스크롤을 막는다. 약한 제스처 preventDefault는 WebView에서 스크롤이 죽을 수 있다.
    if (pulling && dy > 28 && e.cancelable) {
      e.preventDefault();
    }
  };

  const onTouchEnd = () => {
    if (refreshing) return;
    const dy = lastY - startY;
    const shouldRefresh = pulling && dy >= PULL_THRESHOLD;

    if (!shouldRefresh) {
      resetPullUi();
      return;
    }

    refreshing = true;
    ensureIndicator();
    document.body.classList.remove('ohgo-ptr-active');
    document.body.classList.add('ohgo-ptr-refreshing');
    window.dispatchEvent(new Event(EVENT_NAME));

    // 리스너가 비동기 작업을 끝낼 시간을 준 뒤 인디케이터 정리
    window.setTimeout(() => {
      document.body.classList.remove('ohgo-ptr-refreshing');
      resetPullUi();
      refreshing = false;
    }, 900);
  };

  const onInterrupt = () => {
    if (refreshing) return;
    resetPullUi();
    startY = 0;
  };

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('pageshow', onInterrupt);
  document.addEventListener('visibilitychange', onInterrupt);

  return () => {
    gestureRefCount = Math.max(0, gestureRefCount - 1);
    if (gestureRefCount > 0) return;
    gestureInstalled = false;
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('pageshow', onInterrupt);
    document.removeEventListener('visibilitychange', onInterrupt);
    document.body.classList.remove('ohgo-ptr-active', 'ohgo-ptr-refreshing');
    document.body.style.removeProperty('--ohgo-ptr-pull');
  };
}

/**
 * 당겨서 새로고침.
 * Android WebView는 네이티브 PTR이 없고, iOS 네이티브 PTR은 전체 reload라서
 * document 터치 제스처로 `ohgo-pull-refresh` 이벤트를 발생시킨다.
 */
export function useNativePullToRefresh(onRefresh: () => void | Promise<void>) {
  const handlerRef = useRef(onRefresh);
  handlerRef.current = onRefresh;

  useEffect(() => {
    const onEvent = () => {
      void handlerRef.current();
    };
    window.addEventListener(EVENT_NAME, onEvent);
    const uninstallGesture = installDocumentPullGesture();

    return () => {
      window.removeEventListener(EVENT_NAME, onEvent);
      uninstallGesture();
    };
  }, []);
}
