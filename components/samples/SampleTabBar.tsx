'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import {
  IoHomeOutline,
  IoPricetagOutline,
  IoGiftOutline,
  IoGameControllerOutline,
} from 'react-icons/io5';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';

const TABS = [
  { path: '/samples/main', label: '홈', Icon: IoHomeOutline },
  { path: '/samples/stamp', label: '스탬프', Icon: IoPricetagOutline },
  { path: '/samples/coupons', label: '쿠폰', Icon: IoGiftOutline },
  { path: '/samples/mini-games', label: '게임', Icon: IoGameControllerOutline },
] as const;

const HIDDEN_PREFIXES = ['/samples/login', '/samples/admin', '/samples/game', '/samples/qr-scan'];

export default function SampleTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const hidden =
    pathname === '/samples' ||
    HIDDEN_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}-`) || pathname.startsWith(`${p}/`),
    );

  useEffect(() => {
    setMounted(true);
    document.documentElement.style.setProperty('--ohgo-tab-bar-height', `${TAB_BAR_HEIGHT}px`);
  }, []);

  useEffect(() => {
    if (!hidden) {
      document.body.setAttribute('data-has-bottom-tab', 'true');
    } else {
      document.body.removeAttribute('data-has-bottom-tab');
    }
    return () => {
      document.body.removeAttribute('data-has-bottom-tab');
    };
  }, [hidden]);

  if (!mounted || hidden) return null;

  const bar = (
    <nav id="ohgo-bottom-tab-bar" aria-label="샘플 하단 메뉴">
      <div className="ohgo-tab-bar__row">
        {TABS.map(({ path, label, Icon }) => {
          const isActive = pathname === path;
          return (
            <button
              key={path}
              type="button"
              className={`ohgo-tab-bar__item${isActive ? ' ohgo-tab-bar__item--active' : ''}`}
              onClick={() => {
                if (pathname !== path) router.push(path);
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 48,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isActive ? '#EBF1FE' : 'transparent',
                  transition: 'background-color 0.18s',
                  flexShrink: 0,
                }}
              >
                <Icon size={22} style={{ color: isActive ? '#1B6FF5' : '#9CA3AF' }} />
              </span>
              <span
                className="ohgo-tab-bar__label"
                style={{ fontWeight: isActive ? 700 : 500, color: isActive ? '#1B6FF5' : '#6F767E' }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  return createPortal(bar, document.body);
}
