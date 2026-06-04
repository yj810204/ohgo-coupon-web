import { createBrowserClient } from '@supabase/ssr';

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase 환경 변수가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 확인하세요.'
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient(url, anonKey);
}

/** 브라우저 싱글톤 (클라이언트 컴포넌트용) */
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (typeof window === 'undefined') {
    throw new Error('getSupabaseBrowserClient()는 클라이언트에서만 호출할 수 있습니다.');
  }
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}

/** 로그아웃 후 stale 세션 방지 */
export function resetSupabaseBrowserClient() {
  browserClient = null;
}
