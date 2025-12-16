'use client';

import { useEffect, useCallback, useState } from 'react';
import { getUser } from '@/lib/storage';
import { getUserMenuItems, MenuItem } from '@/utils/site-settings-service';
import { getIconComponent } from '@/utils/icon-mapper';
import { getSiteName } from '@/utils/site-settings-service';
import { useNavigation } from '@/hooks/useNavigation';
import PageHeader from '@/components/PageHeader';

interface MenuItemWithIcon extends MenuItem {
  icon: React.ComponentType<any>;
}

export default function MainPage() {
  const { navigate, navigateReplace } = useNavigation();
  const [menuItems, setMenuItems] = useState<MenuItemWithIcon[]>([]);
  const [siteName, setSiteName] = useState('오고피씽');
  const [loading, setLoading] = useState(true);

  const handleRefresh = useCallback(async () => {
    // 메인 페이지는 단순히 인증 확인만
    const user = await getUser();
    if (!user?.uuid) {
      navigateReplace('/login');
      return;
    }

    // 사이트 설정 로드
    try {
      const [menuItemsData, siteNameData] = await Promise.all([
        getUserMenuItems(),
        getSiteName(),
      ]);

      // 아이콘 컴포넌트 매핑
      const itemsWithIcons: MenuItemWithIcon[] = menuItemsData
        .map((item) => {
          const IconComponent = getIconComponent(item.iconName);
          if (!IconComponent) {
            console.warn(`Icon not found: ${item.iconName}`);
            return null;
          }
          return {
            ...item,
            icon: IconComponent,
          };
        })
        .filter((item): item is MenuItemWithIcon => item !== null);

      setMenuItems(itemsWithIcons);
      setSiteName(siteNameData);
    } catch (error) {
      console.error('Error loading site settings:', error);
    } finally {
      setLoading(false);
    }
  }, [navigateReplace]);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  if (loading) {
    return (
      <div 
        className="min-vh-100 bg-light"
        style={{ 
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          position: 'relative',
        }}
      >
        <PageHeader title="오고피씽" showBackButton={false} />
        <div className="container pb-4" style={{ paddingTop: '80px' }}>
          <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '50vh' }}>
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">로딩 중...</span>
              </div>
              <p className="text-muted">로딩 중...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <PageHeader title={siteName} showBackButton={false} />
      <div className="container pb-4" style={{ paddingTop: '80px' }}>

        <div className="row g-4 mb-5">
          {menuItems.length === 0 ? (
            <div className="col-12">
              <div className="text-center py-5">
                <p className="text-muted">메뉴가 없습니다.</p>
              </div>
            </div>
          ) : (
            menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="col-6 col-md-4 col-lg-3">
                  <button
                    onClick={() => navigate(item.path)}
                    className="btn btn-light w-100 h-100 p-4 d-flex flex-column align-items-center shadow-sm"
                    style={{ minHeight: '150px' }}
                  >
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center mb-3"
                      style={{ 
                        width: '80px', 
                        height: '80px',
                        backgroundColor: `${item.color}20` 
                      }}
                    >
                      <Icon size={40} style={{ color: item.color }} />
                    </div>
                    <span className="fw-medium text-dark">{item.label}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

