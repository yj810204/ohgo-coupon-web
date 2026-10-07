/** 이동이 이 시간 안에 끝나지 않으면 해당 주소로 문서를 다시 연다. */
export const NAV_FALLBACK_MS = 8000;

/** 주소만 먼저 바뀌고 RSC 요청이 바로 뒤따르는 경우를 구분하는 짧은 여유. */
export const RSC_GRACE_MS = 120;

export const HISTORY_BACK = '__history_back__';

const HARD_NAV_KEY = 'ohgo-hard-nav';

export type NavState = {
  targetPath: string | null;
  targetHref: string | null;
  fromPath: string | null;
  startedAt: number | null;
  sawRsc: boolean;
};

export const IDLE_NAV: NavState = {
  targetPath: null,
  targetHref: null,
  fromPath: null,
  startedAt: null,
  sawRsc: false,
};

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function pathOf(href: string): string {
  const q = href.indexOf('?');
  const h = href.indexOf('#');
  let end = href.length;
  if (q !== -1) end = Math.min(end, q);
  if (h !== -1) end = Math.min(end, h);
  return href.slice(0, end);
}

export function armNavigation(currentPath: string, href: string, now: number): NavState | null {
  if (!href.startsWith('/')) return null;
  const target = pathOf(href);
  if (!target.startsWith('/')) return null;
  if (target === currentPath) return null;
  return { targetPath: target, targetHref: href, fromPath: currentPath, startedAt: now, sawRsc: false };
}

export function armHistoryBack(currentPath: string, now: number): NavState {
  return {
    targetPath: HISTORY_BACK,
    targetHref: null,
    fromPath: currentPath,
    startedAt: now,
    sawRsc: false,
  };
}

export function noteRsc(state: NavState): NavState {
  if (!state.targetPath) return state;
  return { ...state, sawRsc: true };
}

/**
 * 목적지에 도착했고, 그 이동의 RSC 가 없거나 이미 끝났으면 감시 해제.
 * RSC 가 떠 있으면 주소가 바뀌어도 끝나지 않은 것으로 본다.
 */
export function settleNavigation(
  state: NavState,
  pathname: string,
  inflightRsc: number,
  now: number,
): NavState {
  if (!state.targetPath || state.startedAt == null) return state;
  if (inflightRsc > 0) return state;
  const arrived =
    state.targetPath === HISTORY_BACK ? pathname !== state.fromPath : pathname === state.targetPath;
  if (!arrived) return state;
  if (!state.sawRsc && now - state.startedAt < RSC_GRACE_MS) return state;
  return IDLE_NAV;
}

export function stuckTarget(state: NavState, pathname: string, inflightRsc: number, now: number): string | null {
  if (!state.targetPath || state.startedAt == null) return null;
  if (now - state.startedAt < NAV_FALLBACK_MS) return null;
  const settled = settleNavigation(state, pathname, inflightRsc, now);
  if (!settled.targetPath) return null;
  return state.targetHref || state.targetPath;
}

export function isChunkLoadMessage(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('chunkloaderror') ||
    text.includes('loading chunk') ||
    text.includes('loading css chunk') ||
    text.includes('failed to fetch dynamically imported module') ||
    text.includes('error loading dynamically imported module') ||
    text.includes('importing a module script failed')
  );
}

export function classifyFetchFailure(input: {
  url: string;
  status: number | null;
  online: boolean;
}): 'reload' | 'ignore' {
  if (!input.online) return 'ignore';
  if (input.status == null) return 'ignore';
  let path = input.url;
  try {
    path = new URL(input.url, 'https://ohgo.local').pathname + new URL(input.url, 'https://ohgo.local').search;
  } catch {
    path = input.url;
  }
  const asset = path.includes('/_next/static/');
  if (asset && (input.status === 404 || input.status === 400)) return 'reload';
  const rsc = path.includes('_rsc=') || path.includes('_rsc');
  if (rsc && input.status >= 400) return 'reload';
  return 'ignore';
}

export function shouldReloadMissingChunk(status: number): boolean {
  return status === 404;
}

type HardNavRecord = { href: string; at: number };

export function hardNavigate(
  href: string,
  storage: StorageLike,
  assign: (url: string) => void,
  now: number,
): boolean {
  const raw = storage.getItem(HARD_NAV_KEY);
  if (raw) {
    try {
      const prev = JSON.parse(raw) as HardNavRecord;
      if (prev.href === href && now - prev.at < NAV_FALLBACK_MS) return false;
    } catch {
      storage.removeItem(HARD_NAV_KEY);
    }
  }
  storage.setItem(HARD_NAV_KEY, JSON.stringify({ href, at: now } satisfies HardNavRecord));
  assign(href);
  return true;
}

export function clearHardNavIfLanded(storage: StorageLike, pathname: string): void {
  const raw = storage.getItem(HARD_NAV_KEY);
  if (!raw) return;
  try {
    const prev = JSON.parse(raw) as HardNavRecord;
    if (pathOf(prev.href) === pathname) storage.removeItem(HARD_NAV_KEY);
  } catch {
    storage.removeItem(HARD_NAV_KEY);
  }
}

export function isRscRequest(url: string, rscHeader: string | null): boolean {
  if (rscHeader === '1') return true;
  return url.includes('_rsc=') || url.includes('_rsc');
}

/** 온라인으로 돌아왔는데 이동이 아직이면 그 주소로 다시 연다. */
export function actionOnOnline(state: NavState, pathname: string): string | null {
  if (!state.targetPath || state.targetPath === HISTORY_BACK) return null;
  if (pathname === state.targetPath) return null;
  return state.targetHref || state.targetPath;
}

let liveState: NavState = IDLE_NAV;
let liveInflight = 0;
const listeners = new Set<(state: NavState) => void>();

function emit() {
  for (const listener of listeners) listener(liveState);
}

export function getNavState(): NavState {
  return liveState;
}

export function getInflightRsc(): number {
  return liveInflight;
}

export function subscribeNav(listener: (state: NavState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetNavForTests(): void {
  liveState = IDLE_NAV;
  liveInflight = 0;
  listeners.clear();
}

export function armClientNavigation(currentPath: string, href: string, now = Date.now()): NavState {
  const next = armNavigation(currentPath, href, now);
  liveState = next ?? IDLE_NAV;
  emit();
  return liveState;
}

export function armClientBack(currentPath: string, now = Date.now()): NavState {
  liveState = armHistoryBack(currentPath, now);
  emit();
  return liveState;
}

export function markRscStart(): void {
  liveInflight += 1;
  liveState = noteRsc(liveState);
  emit();
}

export function markRscEnd(): void {
  liveInflight = Math.max(0, liveInflight - 1);
  emit();
}

export function tickNav(pathname: string, now = Date.now()): NavState {
  liveState = settleNavigation(liveState, pathname, liveInflight, now);
  emit();
  return liveState;
}

export function clearNav(): void {
  liveState = IDLE_NAV;
  liveInflight = 0;
  emit();
}
