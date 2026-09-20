'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import { IoLockClosedOutline } from 'react-icons/io5';

const FONT = "var(--font-ohgo), sans-serif";

type GateState = 'loading' | 'form' | 'open';

export default function AdminGateGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>('loading');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const checkGate = useCallback(async () => {
    const appUser = await resolveAppUser();
    if (!appUser) {
      router.replace('/login');
      return;
    }
    if (!appUser.isAdmin && !appUser.isCaptain) {
      router.replace('/main');
      return;
    }

    const res = await fetch('/api/admin-gate', { credentials: 'include' });
    const data = (await res.json()) as { enabled?: boolean; configured?: boolean; unlocked?: boolean };
    setConfigured(data.configured !== false);
    if (data.enabled === false || data.unlocked) {
      setState('open');
      return;
    }
    setState('form');
  }, [router]);

  useEffect(() => {
    void checkGate();
  }, [checkGate, pathname]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin-gate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || '비밀번호가 올바르지 않습니다.');
        return;
      }
      setPassword('');
      setState('open');
    } catch {
      setError('확인에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'open') return <>{children}</>;

  if (state === 'loading') {
    return (
      <div
        className="min-vh-100 d-flex align-items-center justify-content-center"
        style={{ backgroundColor: '#F7F8FA' }}
      >
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center"
      style={{ backgroundColor: '#F7F8FA', padding: 20, fontFamily: FONT }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: 400,
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
          padding: '32px 24px',
        }}
      >
        <div
          className="rounded-circle d-flex align-items-center justify-content-center mx-auto"
          style={{ width: 56, height: 56, backgroundColor: '#EBF1FE', marginBottom: 16 }}
        >
          <IoLockClosedOutline size={26} color="#1B6FF5" />
        </div>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: '#1A1D1F',
            margin: '0 0 6px',
            textAlign: 'center',
          }}
        >
          관리자 확인
        </h1>
        <p
          style={{
            fontSize: 13,
            color: '#6F767E',
            margin: '0 0 20px',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {configured
            ? '관리자 메뉴에 들어가려면 비밀번호를 한 번 더 입력하세요.'
            : '관리자 비밀번호가 없습니다. 설정 파일에 ADMIN_GATE_PASSWORD를 넣어 주세요.'}
        </p>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6F767E', marginBottom: 6 }}>
          비밀번호
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          disabled={!configured || submitting}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: '2px solid #EFEFEF',
            borderRadius: 14,
            padding: '12px 14px',
            fontSize: 15,
            fontFamily: FONT,
            marginBottom: 12,
            outline: 'none',
          }}
        />
        {error ? (
          <p style={{ fontSize: 13, color: '#EF4444', margin: '0 0 12px' }}>{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={!configured || submitting || !password.trim()}
          style={{
            width: '100%',
            backgroundColor: '#1B6FF5',
            color: '#fff',
            borderRadius: 50,
            padding: '14px',
            border: 'none',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: FONT,
            opacity: !configured || submitting || !password.trim() ? 0.45 : 1,
            cursor: !configured || submitting || !password.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '확인 중...' : '확인'}
        </button>
        <button
          type="button"
          onClick={() => router.replace('/main')}
          style={{
            width: '100%',
            marginTop: 10,
            background: 'none',
            border: 'none',
            color: '#6F767E',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: FONT,
            cursor: 'pointer',
            padding: 8,
          }}
        >
          회원 홈으로
        </button>
      </form>
    </div>
  );
}
