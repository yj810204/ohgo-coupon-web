'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useNavigation } from '@/hooks/useNavigation';
import { getBottomTabMenuItems, MenuItem } from '@/utils/site-settings-service';
import { getIconComponent } from '@/utils/icon-mapper';

export default function BottomTabBar() {
  const pathname = usePathname();
  const { navigate } = useNavigation();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMenuItems = async () => {
      try {
        const items = await getBottomTabMenuItems();
        console.log('[BottomTabBar] Loaded menu items:', items);
        console.log('[BottomTabBar] Pathname:', pathname);
        console.log('[BottomTabBar] Items count:', items.length);
        setMenuItems(items);
        
        // 하단 탭 바가 있을 때 body에 data 속성 추가 (CSS에서 padding 적용용)
        if (items.length > 0 && pathname !== '/login') {
          document.body.setAttribute('data-has-bottom-tab', 'true');
        } else {
          document.body.removeAttribute('data-has-bottom-tab');
        }
      } catch (error) {
        console.error('[BottomTabBar] Error loading bottom tab menu items:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMenuItems();
    
    return () => {
      document.body.removeAttribute('data-has-bottom-tab');
    };
  }, [pathname]);

  // 로그인 페이지에서는 하단 탭 바 숨김
  if (pathname === '/login') {
    console.log('[BottomTabBar] Login page - hiding tab bar');
    return null;
  }

  console.log('[BottomTabBar] Rendering - loading:', loading, 'items:', menuItems.length);

  // 로딩 중일 때는 로딩 표시
  if (loading) {
    return (
      <div
        className="bg-white border-top shadow-lg"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          width: '100%',
          height: '70px',
          borderTop: '1px solid #dee2e6',
        }}
      >
        <div className="container d-flex align-items-center justify-content-center h-100">
          <small className="text-muted">로딩 중...</small>
        </div>
      </div>
    );
  }

  // 메뉴 항목이 없으면 안내 메시지 표시
  if (menuItems.length === 0) {
    console.log('[BottomTabBar] No menu items found. Please configure bottom tab menu in admin settings.');
    return (
      <div
        className="bg-white border-top shadow-lg"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          width: '100%',
          height: '70px',
          borderTop: '1px solid #dee2e6',
        }}
      >
        <div className="container d-flex align-items-center justify-content-center h-100">
          <small className="text-muted">하단 탭 메뉴를 설정해주세요 (관리자 → 사이트 설정)</small>
        </div>
      </div>
    );
  }

  const handleTabClick = (path: string) => {
    if (pathname !== path) {
      navigate(path);
    }
  };

  return (
    <div
      className="bg-white border-top shadow-lg"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        width: '100%',
      }}
    >
      <div className="container">
        <div className="d-flex justify-content-around align-items-center py-2">
          {menuItems.map((item) => {
            const IconComponent = getIconComponent(item.iconName);
            // 경로가 정확히 일치하거나 하위 경로인 경우 활성화
            // 홈(/main)의 경우 정확히 일치할 때만 활성화
            const isActive = item.path === '/main' 
              ? pathname === '/main'
              : pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path + '/'));
            
            return (
              <button
                key={item.id}
                type="button"
                className="btn btn-link p-2 d-flex flex-column align-items-center position-relative"
                onClick={() => handleTabClick(item.path)}
                style={{
                  minWidth: '60px',
                  minHeight: '60px',
                  textDecoration: 'none',
                  color: isActive ? item.color : '#6c757d',
                  border: 'none',
                  background: 'none',
                  transition: 'all 0.2s',
                  flex: 1,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = item.color;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = '#6c757d';
                  }
                }}
              >
                {IconComponent ? (
                  <IconComponent
                    size={24}
                    style={{
                      color: isActive ? item.color : '#6c757d',
                      marginBottom: '4px',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      backgroundColor: isActive ? item.color : '#6c757d',
                      borderRadius: '4px',
                      marginBottom: '4px',
                    }}
                  />
                )}
                <span
                  className="small"
                  style={{
                    fontSize: '11px',
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? item.color : '#6c757d',
                  }}
                >
                  {item.label}
                </span>
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '0',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '30px',
                      height: '3px',
                      backgroundColor: item.color,
                      borderRadius: '3px 3px 0 0',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

