import {
  HISTORY_BACK,
  actionOnOnline,
  classifyFetchFailure,
  clearHardNavIfLanded,
  clearNav,
  getInflightRsc,
  getNavState,
  hardNavigate,
  isChunkLoadMessage,
  isRscRequest,
  markRscEnd,
  markRscStart,
  shouldReloadMissingChunk,
  stuckTarget,
  tickNav,
} from '@/lib/navigation-guard';

function assign(url: string) {
  window.location.assign(url);
}

export function recoverStuckNavigation(now = Date.now()): boolean {
  const state = getNavState();
  const pathname = window.location.pathname;
  const target = stuckTarget(state, pathname, getInflightRsc(), now);
  if (!target) return false;
  clearNav();
  const href = target === HISTORY_BACK ? pathname : target;
  return hardNavigate(href, window.sessionStorage, assign, now);
}

export function reloadToPendingOrHere(): void {
  const pending = getNavState().targetPath;
  const href = pending && pending !== HISTORY_BACK ? pending : window.location.pathname;
  clearNav();
  hardNavigate(href, window.sessionStorage, assign, Date.now());
}

let patched = false;

export function installNavigationFetchPatch(): void {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headerBag = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const tracked = isRscRequest(url, headerBag.get('RSC')) && getNavState().targetPath != null;
    if (tracked) markRscStart();
    try {
      const response = await original(input, init);
      if (tracked) markRscEnd();
      if (classifyFetchFailure({ url, status: response.status, online: navigator.onLine }) === 'reload') {
        reloadToPendingOrHere();
      } else if (tracked) {
        tickNav(window.location.pathname);
      }
      return response;
    } catch (error) {
      if (tracked) markRscEnd();
      throw error;
    }
  };
}

export function noteLanded(pathname: string): void {
  clearHardNavIfLanded(window.sessionStorage, pathname);
  tickNav(pathname);
}

export function recoverOnlineNavigation(): boolean {
  const href = actionOnOnline(getNavState(), window.location.pathname);
  if (!href) return false;
  clearNav();
  return hardNavigate(href, window.sessionStorage, assign, Date.now());
}

export async function probeDeployedChunks(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const script = document.querySelector('script[src*="/_next/static/"]');
  const src = script?.getAttribute('src');
  if (!src) return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(src, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    if (!shouldReloadMissingChunk(response.status)) return false;
    hardNavigate(window.location.pathname + window.location.search, window.sessionStorage, assign, Date.now());
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export function isChunkFailureEvent(message: string, target: EventTarget | null): boolean {
  if (target instanceof HTMLScriptElement && target.src.includes('/_next/static/')) return true;
  return isChunkLoadMessage(message);
}

if (typeof window !== 'undefined') {
  installNavigationFetchPatch();
}
