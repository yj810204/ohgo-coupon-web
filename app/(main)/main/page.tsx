'use client';

import { useEffect, useCallback, useState } from 'react';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import { getUserMenuItems, MenuItem } from '@/utils/site-settings-service';
import { getIconComponent } from '@/utils/icon-mapper';
import { getSiteName } from '@/utils/site-settings-service';
import { useNavigation } from '@/hooks/useNavigation';
import PageHeader from '@/components/PageHeader';
import { IoPeopleOutline, IoCalendarOutline, IoNotificationsOutline, IoGameControllerOutline, IoBoatOutline, IoSettingsOutline, IoChatbubblesOutline, IoImageOutline, IoConstructOutline } from 'react-icons/io5';

interface MenuItemWithIcon extends MenuItem {
  icon: React.ComponentType<any>;
}

export default function MainPage() {
  const { navigate, navigateReplace } = useNavigation();
  const [menuItems, setMenuItems] = useState<MenuItemWithIcon[]>([]);
  const [siteName, setSiteName] = useState('오고피씽');
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const handleRefresh = useCallback(async () => {
    // 메인 페이지는 단순히 인증 확인만
    const user = await getUser();
    if (!user?.uuid) {
      navigateReplace('/login');
      return;
    }

    // 관리자 여부 확인
    const remoteUser = await getUserByUUID(user.uuid);
    const userIsAdmin = !!remoteUser?.isAdmin;
    setIsAdmin(userIsAdmin);

    // 사이트 설정 로드
    try {
      let menuItemsData: MenuItem[];
      let pageTitle: string;

      if (userIsAdmin) {
        // 관리자인 경우 관리자 메뉴 표시
        menuItemsData = [
          { id: 'admin-users', label: '회원 관리', path: '/admin', iconName: 'IoPeopleOutline', color: '#1E88E5', isActive: true, order: 1 },
          { id: 'admin-roster', label: '승선 명부', path: '/today-roster', iconName: 'IoCalendarOutline', color: '#FF5722', isActive: true, order: 2 },
          { id: 'admin-push', label: '전체 알림', path: '/admin-push', iconName: 'IoNotificationsOutline', color: '#FF9500', isActive: true, order: 3 },
          { id: 'admin-games', label: '미니 게임', path: '/mini-games', iconName: 'IoGameControllerOutline', color: '#FF3B30', isActive: true, order: 4 },
          { id: 'admin-game-settings', label: '게임 설정', path: '/admin-game-settings', iconName: 'IoSettingsOutline', color: '#4CAF50', isActive: true, order: 5 },
          { id: 'admin-boarding', label: '명부 작성', path: '/boarding-form', iconName: 'IoBoatOutline', color: '#007AFF', isActive: true, order: 6 },
          { id: 'admin-photos', label: '조황사진 관리', path: '/admin-photos', iconName: 'IoImageOutline', color: '#9C27B0', isActive: true, order: 7 },
          { id: 'admin-community', label: '커뮤니티 관리', path: '/admin-community', iconName: 'IoChatbubblesOutline', color: '#00BCD4', isActive: true, order: 8 },
          { id: 'admin-site-settings', label: '사이트 설정', path: '/admin-site-settings', iconName: 'IoConstructOutline', color: '#795548', isActive: true, order: 9 },
        ];
        pageTitle = '관리자';
      } else {
        // 일반 사용자인 경우 일반 메뉴 표시
        const [userMenuItems, siteNameData] = await Promise.all([
          getUserMenuItems(),
          getSiteName(),
        ]);
        menuItemsData = userMenuItems;
        pageTitle = siteNameData;
      }

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
      setSiteName(pageTitle);
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
        <div className="container">
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
      <div className="container">

        <div className="row g-4">
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

