'use client';

import { useState, useRef, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { IoFishOutline, IoPeopleOutline, IoTrophyOutline } from 'react-icons/io5';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";

const SLIDES = [
  {
    icon: <IoFishOutline size={64} color="#1B6FF5" />,
    accentColor: '#1B6FF5',
    bgGradient: 'linear-gradient(160deg, #EBF1FE 0%, #F5F8FF 100%)',
    tag: '오고피씽',
    title: '낚시의 즐거움을\n함께 나눠요',
    desc: '전국 낚시인들이 모이는 커뮤니티에서\n조황 정보와 노하우를 공유하세요.',
  },
  {
    icon: <IoPeopleOutline size={64} color="#00C48C" />,
    accentColor: '#00C48C',
    bgGradient: 'linear-gradient(160deg, #E6F8F3 0%, #F5FDF9 100%)',
    tag: '커뮤니티',
    title: '스탬프 적립하고\n쿠폰도 받으세요',
    desc: '출조마다 스탬프를 쌓아 쿠폰을 발급받고\n포인트몰에서 다양한 혜택을 누리세요.',
  },
  {
    icon: <IoTrophyOutline size={64} color="#FF9500" />,
    accentColor: '#FF9500',
    bgGradient: 'linear-gradient(160deg, #FFF3E0 0%, #FFFAF5 100%)',
    tag: '미니게임',
    title: '미끼로 즐기는\n미니게임',
    desc: '커뮤니티 포인트로 미끼를 구매하고\n미니게임에서 추가 포인트를 획득하세요.',
  },
];

const DOT_INACTIVE: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: '#D9E2F3',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  transition: 'all 0.3s',
};

export default function OnboardingPage() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const isLast = current === SLIDES.length - 1;

  const markDoneAndGo = () => {
    try { localStorage.setItem('ohgo_onboarded', '1'); } catch {}
    router.replace('/login');
  };

  const goNext = () => {
    if (isLast) markDoneAndGo();
    else setCurrent(c => c + 1);
  };

  const slide = SLIDES[current];

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT,
        backgroundColor: '#FFFFFF',
        overflowX: 'hidden',
      }}
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return;
        const delta = touchStartX.current - e.changedTouches[0].clientX;
        if (delta > 50 && current < SLIDES.length - 1) setCurrent(c => c + 1);
        if (delta < -50 && current > 0) setCurrent(c => c - 1);
        touchStartX.current = null;
      }}
    >
      {/* 상단 Skip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px 24px 0' }}>
        {!isLast && (
          <button
            type="button"
            onClick={markDoneAndGo}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              color: '#9CA3AF',
              fontFamily: FONT,
              cursor: 'pointer',
              padding: '6px 4px',
            }}
          >
            건너뛰기
          </button>
        )}
      </div>

      {/* 일러스트 Placeholder 영역 */}
      <div
        style={{
          flex: '0 0 auto',
          margin: '16px 24px 0',
          borderRadius: 28,
          background: slide.bgGradient,
          height: 280,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          transition: 'background 0.4s',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 배경 원 장식 */}
        <div style={{
          position: 'absolute',
          width: 200,
          height: 200,
          borderRadius: '50%',
          backgroundColor: slide.accentColor,
          opacity: 0.06,
          top: -40,
          right: -40,
        }} />
        <div style={{
          position: 'absolute',
          width: 140,
          height: 140,
          borderRadius: '50%',
          backgroundColor: slide.accentColor,
          opacity: 0.07,
          bottom: -30,
          left: -30,
        }} />

        {/* 아이콘 원형 배경 */}
        <div style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          boxShadow: `0 8px 32px ${slide.accentColor}33`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {slide.icon}
        </div>

        {/* Placeholder 안내 */}
        <span style={{
          fontSize: 12,
          color: slide.accentColor,
          fontWeight: 600,
          opacity: 0.7,
          letterSpacing: 0.3,
        }}>
          이미지 영역
        </span>
      </div>

      {/* 텍스트 영역 */}
      <div style={{ flex: 1, padding: '32px 32px 0', display: 'flex', flexDirection: 'column' }}>
        {/* 태그 */}
        <div style={{
          display: 'inline-block',
          backgroundColor: slide.accentColor + '1A',
          color: slide.accentColor,
          borderRadius: 20,
          padding: '4px 14px',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.3,
          alignSelf: 'flex-start',
          marginBottom: 14,
        }}>
          {slide.tag}
        </div>

        {/* 제목 */}
        <h1 style={{
          fontSize: 28,
          fontWeight: 800,
          color: '#1A1D1F',
          lineHeight: 1.3,
          margin: '0 0 14px',
          letterSpacing: -0.5,
          whiteSpace: 'pre-line',
        }}>
          {slide.title}
        </h1>

        {/* 설명 */}
        <p style={{
          fontSize: 15,
          fontWeight: 400,
          color: '#6F767E',
          lineHeight: 1.7,
          margin: 0,
          whiteSpace: 'pre-line',
        }}>
          {slide.desc}
        </p>
      </div>

      {/* 하단 네비게이션 */}
      <div style={{
        padding: '28px 24px calc(env(safe-area-inset-bottom, 0px) + 28px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        alignItems: 'center',
      }}>
        {/* 도트 인디케이터 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`슬라이드 ${i + 1}`}
              onClick={() => setCurrent(i)}
              style={{
                ...DOT_INACTIVE,
                ...(i === current
                  ? { width: 24, backgroundColor: slide.accentColor }
                  : {}),
              }}
            />
          ))}
        </div>

        {/* 다음/시작 버튼 */}
        <button
          type="button"
          onClick={goNext}
          style={{
            width: '100%',
            maxWidth: 420,
            padding: '16px',
            border: 'none',
            borderRadius: 50,
            backgroundColor: slide.accentColor,
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: FONT,
            cursor: 'pointer',
            boxShadow: `0 8px 24px ${slide.accentColor}44`,
            transition: 'background 0.3s, box-shadow 0.3s',
          }}
        >
          {isLast ? '시작하기' : '다음'}
        </button>
      </div>
    </div>
  );
}
