'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveUser } from '@/lib/storage';
import { getSupabaseSessionUser, getProfileByUserId } from '@/lib/supabase-auth';
import { getHomePathForUser } from '@/lib/auth-session';
import { requiresProfileSetup } from '@/lib/profile-complete';
import { IoPersonOutline, IoCalendarOutline } from 'react-icons/io5';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";

export default function ProfileSetupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      const user = await getSupabaseSessionUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const profile = await getProfileByUserId(user.id);
      if (!profile || !requiresProfileSetup(profile)) {
        router.replace(
          getHomePathForUser({
            uuid: user.id,
            name: profile?.name ?? '',
            dob: profile?.dob ?? '',
            isAdmin: profile?.role === 'admin',
          })
        );
        return;
      }
      setChecking(false);
    };
    void check();
  }, [router]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert('이름을 입력해 주세요.');
      return;
    }
    if (!dob.trim()) {
      alert('생년월일을 입력해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/merge-legacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), dob: dob.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.message || '프로필 저장에 실패했습니다.');
        return;
      }

      await saveUser({
        uuid: data.authUserId,
        name: name.trim(),
        dob: data.dob ?? dob.trim(),
        isAdmin: Boolean(data.isAdmin),
      });

      if (data.merged) {
        alert('승선명부에 등록된 정보와 연결되었습니다.');
      }

      router.replace(
        getHomePathForUser({
          uuid: data.authUserId,
          name: name.trim(),
          dob: data.dob ?? dob.trim(),
          isAdmin: Boolean(data.isAdmin),
        })
      );
    } catch (e) {
      console.error(e);
      alert('오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F7F8FA',
        }}
      >
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT,
        backgroundColor: '#F7F8FA',
        padding: '32px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
          backgroundColor: '#fff',
          borderRadius: 20,
          padding: '28px 24px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1D1F', margin: '0 0 8px' }}>
          프로필 설정
        </h1>
        <p style={{ fontSize: 14, color: '#6F767E', margin: '0 0 24px', lineHeight: 1.6 }}>
          서비스 이용을 위해 이름과 생년월일을 입력해 주세요.
        </p>

        <div style={{ position: 'relative', marginBottom: 14 }}>
          <IoPersonOutline
            size={18}
            color="#ABABAB"
            style={{
              position: 'absolute',
              top: '50%',
              left: 14,
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="실명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: '100%',
              fontSize: 15,
              borderRadius: 14,
              border: '2px solid #EFEFEF',
              padding: '14px 16px 14px 42px',
              fontFamily: FONT,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ position: 'relative', marginBottom: 24 }}>
          <IoCalendarOutline
            size={18}
            color="#ABABAB"
            style={{
              position: 'absolute',
              top: '50%',
              left: 14,
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="생년월일 (예: 720610 또는 19720610)"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            maxLength={8}
            inputMode="numeric"
            style={{
              width: '100%',
              fontSize: 15,
              borderRadius: 14,
              border: '2px solid #EFEFEF',
              padding: '14px 16px 14px 42px',
              fontFamily: FONT,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            backgroundColor: '#1B6FF5',
            color: '#fff',
            borderRadius: 50,
            padding: '16px',
            border: 'none',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: FONT,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '저장 중...' : '시작하기'}
        </button>
      </div>
    </div>
  );
}
