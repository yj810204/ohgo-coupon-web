'use client';

import { useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { SAMPLE_USER } from '@/lib/samples/mock-data';

const FONT = "var(--font-ohgo), sans-serif";

export default function SampleLoginPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(true);
  const [name, setName] = useState<string>(SAMPLE_USER.name);
  const [dob, setDob] = useState<string>(SAMPLE_USER.dob);

  const handleDemoLogin = () => {
    if (!agreed) {
      alert('샘플: 개인정보처리방침에 동의해 주세요.');
      return;
    }
    router.push('/samples/main');
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT,
        backgroundColor: '#FFFFFF',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          background: 'linear-gradient(160deg, #EBF1FE 0%, #DCEAFE 60%, #C7DCFF 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: '48px 24px 36px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 260,
            height: 260,
            borderRadius: '50%',
            backgroundColor: '#1B6FF5',
            opacity: 0.05,
            top: -80,
            right: -60,
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 180,
            height: 180,
            borderRadius: '50%',
            backgroundColor: '#1B6FF5',
            opacity: 0.06,
            bottom: -50,
            left: -40,
          }}
        />

        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1B6FF5 0%, #5B8DEF 100%)',
            boxShadow: '0 12px 32px rgba(27,111,245,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 30, fontWeight: 800, color: '#fff', fontFamily: FONT }}>오</span>
        </div>

        <div style={{ textAlign: 'center' }}>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: '#1A1D1F',
              margin: '0 0 6px',
              letterSpacing: -0.5,
            }}
          >
            오고피씽
          </h1>
          <p style={{ fontSize: 14, color: '#6F767E', margin: 0, lineHeight: 1.5 }}>
            낚시 커뮤니티에 오신 것을 환영합니다
          </p>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          backgroundColor: '#FFFFFF',
          borderRadius: '28px 28px 0 0',
          marginTop: -20,
          padding: '32px 24px',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.06)',
          maxWidth: 480,
          width: '100%',
          alignSelf: 'center',
          boxSizing: 'border-box',
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: '#1A1D1F',
            margin: '0 0 4px',
            letterSpacing: -0.3,
          }}
        >
          로그인
        </h2>
        <p style={{ fontSize: 13, color: '#9CA3AF', margin: '0 0 20px' }}>
          기등록 회원은 이름·생년월일로 로그인하세요
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 20,
            padding: '12px 14px',
            borderRadius: 14,
            backgroundColor: '#F7F8FA',
          }}
        >
          <input
            type="checkbox"
            id="sample-agree"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="form-check-input flex-shrink-0"
            style={{ cursor: 'pointer', width: 20, height: 20, marginTop: 0, accentColor: '#1B6FF5' }}
          />
          <label
            htmlFor="sample-agree"
            style={{ flex: 1, fontSize: 13, color: '#6F767E', cursor: 'pointer', margin: 0 }}
          >
            개인정보 처리방침에 동의합니다.
          </label>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              backgroundColor: '#EBF1FE',
              color: '#1B6FF5',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <IoDocumentTextOutline size={13} />
            보기
          </span>
        </div>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6F767E', marginBottom: 6 }}>
          이름
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
          readOnly
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
            backgroundColor: '#F7F8FA',
          }}
        />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6F767E', marginBottom: 6 }}>
          생년월일
        </label>
        <input
          type="text"
          value={dob}
          readOnly
          placeholder="YYMMDD"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: '2px solid #EFEFEF',
            borderRadius: 14,
            padding: '12px 14px',
            fontSize: 15,
            fontFamily: FONT,
            marginBottom: 16,
            outline: 'none',
            backgroundColor: '#F7F8FA',
          }}
        />
        <button
          type="button"
          onClick={handleDemoLogin}
          disabled={!agreed}
          style={{
            width: '100%',
            backgroundColor: '#1B6FF5',
            color: '#FFFFFF',
            borderRadius: 50,
            padding: '14px',
            border: 'none',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: FONT,
            opacity: agreed ? 1 : 0.45,
            cursor: agreed ? 'pointer' : 'not-allowed',
            marginBottom: 12,
          }}
        >
          로그인
        </button>
        <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', margin: 0 }}>
          샘플 화면 — API 없이 메인으로 이동합니다
        </p>
      </div>
    </div>
  );
}
