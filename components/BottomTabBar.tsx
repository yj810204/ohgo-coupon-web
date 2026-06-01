'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useNavigation } from '@/hooks/useNavigation';
import { getBottomTabMenuItems, type MenuItem } from '@/utils/site-settings-service';
import { getIconComponent } from '@/utils/icon-mapper';

export const TAB_BAR_HEIGHT = 60;

export default function BottomTabBar() {
  const pathname = usePathname();
  const { navigate } = useNavigation();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.documentElement.style.setProperty('--ohgo-tab-bar-height', `${TAB_BAR_HEIGHT}px`);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const items = await getBottomTabMenuItems();
        setMenuItems(items);
        if (items.length > 0 && pathname !== '/login') {
          document.body.setAttribute('data-has-bottom-tab', 'true');
        } else {
          document.body.removeAttribute('data-has-bottom-tab');
        }
      } catch (e) {
        console.error('[BottomTabBar]', e);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => { document.body.removeAttribute('data-has-bottom-tab'); };
  }, [pathname]);

  if (!mounted || pathname === '/login') return null;

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
