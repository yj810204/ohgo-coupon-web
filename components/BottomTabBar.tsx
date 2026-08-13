'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useNavigation } from '@/hooks/useNavigation';
import {
  getBottomTabMenuItems,
  peekBottomTabMenuItems,
  type MenuItem,
} from '@/utils/site-settings-service';
import { getIconComponent } from '@/utils/icon-mapper';
import { isMiniGamePlayRoute } from '@/lib/mini-game-routes';

export const TAB_BAR_HEIGHT = 60;

/** 전체화면·오버레이 UI — 하단 탭이 버튼을 가리지 않도록 숨김 */
function shouldHideBottomTab(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/onboarding' ||
    pathname === '/profile-setup' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/samples') ||
    pathname.startsWith('/roster-preview') ||
    isMiniGamePlayRoute(pathname)
  );
}

function syncBottomTabInset(visible: boolean) {
  if (visible) {
    document.body.setAttribute('data-has-bottom-tab', 'true');
  } else {
    document.body.removeAttribute('data-has-bottom-tab');
  }
}

export default function BottomTabBar() {
  const pathname = usePathname();
  const { navigate } = useNavigation();
  const cached = peekBottomTabMenuItems();
  const [menuItems, setMenuItems] = useState<MenuItem[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [mounted, setMounted] = useState(false);
  const tabVisible = !shouldHideBottomTab(pathname);

  useEffect(() => {
    setMounted(true);
    document.documentElement.style.setProperty('--ohgo-tab-bar-height', `${TAB_BAR_HEIGHT}px`);
  }, []);

  // 메뉴 로드 여부와 무관하게, 탭바가 보이는 동안 본문 하단 inset을 즉시 확보
  useEffect(() => {
    syncBottomTabInset(tabVisible);
    return () => { syncBottomTabInset(false); };
  }, [tabVisible]);

  // 메뉴 데이터는 경로와 무관 — pathname refetch 제거
  useEffect(() => {
    if (!tabVisible) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const items = await getBottomTabMenuItems();
        if (!cancelled) setMenuItems(items);
      } catch (e) {
        console.error('[BottomTabBar]', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (!peekBottomTabMenuItems()) setLoading(true);
    load();
    return () => { cancelled = true; };
  }, [tabVisible]);

  if (!mounted || !tabVisible) {
    return null;
  }

  const handleTabClick = (path: string) => {
    if (pathname !== path) navigate(path);
  };

  const bar = (
    <nav id="ohgo-bottom-tab-bar" aria-label="하단 메뉴">
      <div className="ohgo-tab-bar__row">
        {loading ? (
          <small style={{ margin: 'auto', color: '#9CA3AF' }}>로딩 중...</small>
        ) : menuItems.length === 0 ? (
          <small style={{ margin: 'auto', color: '#9CA3AF' }}>메뉴 설정 필요</small>
        ) : (
          menuItems.map((item) => {
            const IconComponent = getIconComponent(item.iconName);
            const isActive =
              item.path === '/main'
                ? pathname === '/main'
                : pathname === item.path ||
                  (item.path !== '/' && pathname.startsWith(item.path + '/'));

            return (
              <button
                key={item.id}
                type="button"
                className={`ohgo-tab-bar__item${isActive ? ' ohgo-tab-bar__item--active' : ''}`}
                onClick={() => handleTabClick(item.path)}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* 아이콘을 pill 배경으로 감쌈 */}
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 48,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isActive ? '#EBF1FE' : 'transparent',
                  transition: 'background-color 0.18s',
                  flexShrink: 0,
                }}>
                  {IconComponent ? (
                    <IconComponent size={22} style={{ color: isActive ? '#1B6FF5' : '#9CA3AF' }} />
                  ) : (
                    <span style={{ width: 22, height: 22, backgroundColor: isActive ? '#1B6FF5' : '#9CA3AF', borderRadius: 4 }} />
                  )}
                </span>
                <span
                  className="ohgo-tab-bar__label"
                  style={{ fontWeight: isActive ? 700 : 500, color: isActive ? '#1B6FF5' : '#6F767E' }}
                >
                  {item.label}
                </span>
              </button>
            );
          })
        )}
      </div>
    </nav>
  );

  return createPortal(bar, document.body);
}
