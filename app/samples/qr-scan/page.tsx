'use client';

import { useRouter } from '@/hooks/useAppRouter';

const FRAME = 260;

/**
 * 포트폴리오 캡처용 QR 리더 UI (카메라 없이 샘플 QR + 스캔 라인).
 */
export default function SampleQrScanPage() {
  const router = useRouter();

  return (
    <div
      data-sample-qr-ready="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#000',
        width: '100%',
        height: '100%',
        maxWidth: '100vw',
        maxHeight: '100dvh',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @keyframes ohgo-qr-scan-line {
          0% { top: 10%; opacity: 0.55; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 86%; opacity: 0.55; }
        }
      `}</style>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          background:
            'radial-gradient(ellipse at center, #2A2F35 0%, #121416 72%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '28px 20px 24px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 300,
            textAlign: 'center',
            color: '#fff',
            marginBottom: 24,
            flexShrink: 0,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1.35,
              letterSpacing: '-0.2px',
            }}
          >
            QR 코드를 스캔하세요
          </p>
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.55,
              color: 'rgba(255,255,255,0.78)',
            }}
          >
            휴대폰 카메라로 QR 코드를
            <br />
            중앙 사각형 안에 맞춰주세요
          </p>
        </div>

        <div
          style={{
            position: 'relative',
            width: FRAME,
            height: FRAME,
            flexShrink: 0,
            borderRadius: 12,
            overflow: 'hidden',
            backgroundColor: '#fff',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
          }}
        >
          {/* 샘플 QR */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sample-assets/qr-sample.png"
            alt="샘플 QR 코드"
            width={FRAME}
            height={FRAME}
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              padding: 18,
              boxSizing: 'border-box',
              display: 'block',
              backgroundColor: '#fff',
            }}
          />

          {/* 스캔 라인 (리딩 중) — 컨테이너가 위아래로 이동 */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: 28,
              top: '42%',
              transform: 'translateY(-50%)',
              animation: 'ohgo-qr-scan-line 2s ease-in-out infinite alternate',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '50%',
                height: 28,
                transform: 'translateY(-50%)',
                background:
                  'linear-gradient(180deg, transparent 0%, rgba(57,255,20,0.14) 45%, rgba(57,255,20,0.14) 55%, transparent 100%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 10,
                right: 10,
                top: '50%',
                height: 2,
                transform: 'translateY(-50%)',
                borderRadius: 2,
                background:
                  'linear-gradient(90deg, transparent 0%, #39FF14 12%, #39FF14 88%, transparent 100%)',
                boxShadow:
                  '0 0 10px 2px rgba(57,255,20,0.85), 0 0 22px 6px rgba(57,255,20,0.35)',
              }}
            />
          </div>

          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: '3px solid rgba(255,255,255,0.95)',
              borderRadius: 12,
              pointerEvents: 'none',
              zIndex: 4,
            }}
          />
          {[
            { top: -2, left: -2, borderTop: '5px solid #fff', borderLeft: '5px solid #fff' },
            { top: -2, right: -2, borderTop: '5px solid #fff', borderRight: '5px solid #fff' },
            { bottom: -2, left: -2, borderBottom: '5px solid #fff', borderLeft: '5px solid #fff' },
            { bottom: -2, right: -2, borderBottom: '5px solid #fff', borderRight: '5px solid #fff' },
          ].map((corner, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 28,
                height: 28,
                borderRadius: 4,
                zIndex: 5,
                ...corner,
              }}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          width: '100%',
          boxSizing: 'border-box',
          backgroundColor: '#fff',
          borderTop: '1px solid #E8EAED',
          padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <button
          type="button"
          onClick={() => router.push('/samples/stamp')}
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            margin: 0,
            borderRadius: 12,
            padding: '14px 16px',
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.2,
            border: 'none',
            backgroundColor: '#F2F3F5',
            color: '#1A1D1F',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          뒤로 가기
        </button>
      </div>
    </div>
  );
}
