/**
 * 전역 알림/확인 다이얼로그 (OhgoModal 호스트와 연동).
 * WebView 기본 alert/confirm 은 제목에 도메인(ohgo.codejaka.com)이 붙으므로 대체한다.
 */

export type OhgoDialogRequest =
  | {
      id: number;
      kind: 'alert';
      title: string;
      message: string;
      resolve: () => void;
    }
  | {
      id: number;
      kind: 'confirm';
      title: string;
      message: string;
      resolve: (ok: boolean) => void;
    };

type Listener = (req: OhgoDialogRequest | null) => void;

const DEFAULT_TITLE = '오고피씽';

let seq = 0;
let current: OhgoDialogRequest | null = null;
const queue: OhgoDialogRequest[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(current));
}

function dequeueNext() {
  current = queue.shift() ?? null;
  emit();
}

function enqueue(req: OhgoDialogRequest) {
  if (!current) {
    current = req;
    emit();
  } else {
    queue.push(req);
  }
}

export function subscribeOhgoDialog(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

export function resolveOhgoDialog(id: number, ok = true) {
  if (!current || current.id !== id) return;
  const req = current;
  if (req.kind === 'alert') req.resolve();
  else req.resolve(ok);
  dequeueNext();
}

export function ohgoAlert(message: string, title: string = DEFAULT_TITLE): Promise<void> {
  const text = String(message ?? '');
  return new Promise<void>((resolve) => {
    enqueue({
      id: ++seq,
      kind: 'alert',
      title,
      message: text,
      resolve,
    });
  });
}

export function ohgoConfirm(message: string, title: string = DEFAULT_TITLE): Promise<boolean> {
  const text = String(message ?? '');
  return new Promise<boolean>((resolve) => {
    enqueue({
      id: ++seq,
      kind: 'confirm',
      title,
      message: text,
      resolve,
    });
  });
}

/** window.alert / (선택) 네이티브 브리지용 초기 패치 */
export function installOhgoDialogGlobals() {
  if (typeof window === 'undefined') return;

  const w = window as Window & {
    ohgoAlert?: typeof ohgoAlert;
    ohgoConfirm?: typeof ohgoConfirm;
    __ohgoAlert?: (message: string) => void;
  };

  w.alert = (message?: unknown) => {
    void ohgoAlert(message == null ? '' : String(message));
  };

  w.ohgoAlert = ohgoAlert;
  w.ohgoConfirm = ohgoConfirm;
  // 네이티브 주입 스크립트 폴백이 웹 모달을 쓰도록
  w.__ohgoAlert = (message: string) => {
    void ohgoAlert(message);
  };
}
