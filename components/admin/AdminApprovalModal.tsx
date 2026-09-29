'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import OhgoModal, { OhgoModalButton, OhgoModalCancelLink } from '@/components/OhgoModal';
import { verifyAdminApproval } from '@/lib/admin-approval';
import { OHGO_FONT, OHGO_INPUT } from '@/lib/page-styles';

export function AdminPasswordField({
  value,
  onChange,
  error,
  disabled,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  onEnter?: () => void;
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#33383F', fontFamily: OHGO_FONT }}>
        관리자 비밀번호 <span style={{ color: '#FF3B30' }}>*</span>
      </label>
      <input
        type="password"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        placeholder="비밀번호를 입력해야 승인됩니다"
        style={{ ...OHGO_INPUT, width: '100%', backgroundColor: '#FFFFFF' }}
      />
      {error && (
        <p style={{ color: '#FF3B30', fontSize: 12, margin: '6px 0 0', fontFamily: OHGO_FONT }}>{error}</p>
      )}
    </div>
  );
}

/** approve(설명) 를 부르면 비밀번호 창을 띄우고, 확인되면 true. */
export function useAdminApproval(): { approve: (message: string) => Promise<boolean>; modal: ReactNode } {
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setMessage(null);
    setPassword('');
    setError('');
  };

  const approve = useCallback((text: string) => {
    setMessage(text);
    setPassword('');
    setError('');
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const submit = async () => {
    if (checking) return;
    setChecking(true);
    const result = await verifyAdminApproval(password);
    setChecking(false);
    if (result.ok) finish(true);
    else setError(result.message);
  };

  const modal = (
    <OhgoModal
      open={message != null}
      onClose={() => !checking && finish(false)}
      title="조정 승인"
      closeOnBackdrop={!checking}
      footer={
        <>
          <OhgoModalButton variant="primary" onClick={() => void submit()} disabled={!password || checking}>
            {checking ? '확인 중...' : '승인'}
          </OhgoModalButton>
          <OhgoModalCancelLink onClick={() => finish(false)} disabled={checking} />
        </>
      }
    >
      <p style={{ fontSize: 14, color: '#1A1D1F', margin: '0 0 14px', whiteSpace: 'pre-line', fontFamily: OHGO_FONT }}>
        {message}
      </p>
      <AdminPasswordField value={password} onChange={setPassword} error={error} disabled={checking} onEnter={() => void submit()} />
    </OhgoModal>
  );

  return { approve, modal };
}
