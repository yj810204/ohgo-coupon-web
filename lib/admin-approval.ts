/** 조정 전에 관리자 비밀번호를 서버에서 확인한다. 실패하면 사유 문구를 돌려준다. */
export async function verifyAdminApproval(password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!password.trim()) return { ok: false, message: '비밀번호를 입력해 주세요.' };
  try {
    const res = await fetch('/api/admin-approve', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, message: data?.error || '비밀번호를 확인하지 못했습니다.' };
  } catch {
    return { ok: false, message: '비밀번호를 확인하지 못했습니다. 네트워크를 확인해 주세요.' };
  }
}
