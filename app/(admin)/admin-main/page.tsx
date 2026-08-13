'use client';

import { useEffect, useState } from 'react';
import { resolveAppUser } from '@/lib/auth-session';
import {
  IoPeopleOutline,
  IoCalendarOutline,
  IoNotificationsOutline,
  IoGameControllerOutline,
  IoSettingsOutline,
  IoChatbubblesOutline,
  IoImageOutline,
  IoConstructOutline,
  IoBoatOutline,
  IoStorefrontOutline,
  IoChevronForwardOutline,
  IoHomeOutline,
  IoShieldCheckmarkOutline,
  IoFishOutline,
} from 'react-icons/io5';
import { useNavigation } from '@/hooks/useNavigation';
import SubPageFrame from '@/components/SubPageFrame';
import { OHGO_LIST, OHGO_LIST_DIVIDER } from '@/lib/page-styles';

const FONT = "var(--font-ohgo), sans-serif";
const CARD: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: 'none',
};

type MenuItem = {
  id: string;
  label: string;
  desc: string;
  path: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  bg: string;
};

type MenuSection = {
  id: string;
  title: string;
  items: MenuItem[];
};

const MENU_SECTIONS: MenuSection[] = [
  {
    id: 'members',
    title: '회원 · 명부',
    items: [
      {
        id: 'admin',
        label: '회원 관리',
        desc: '회원 조회, 스탬프·쿠폰 관리',
        path: '/admin',
        icon: IoPeopleOutline,
        color: '#1B6FF5',
        bg: '#EBF1FE',
      },
      {
        id: 'roster',
        label: '승선 명부',
        desc: '당일 승선 명부 확인 및 관리',
        path: '/today-roster',
        icon: IoCalendarOutline,
        color: '#FF5722',
        bg: '#FFF0EB',
      },
    ],
  },
  {
    id: 'notify-game',
    title: '알림 · 게임',
    items: [
      {
        id: 'push',
        label: '전체 알림',
        desc: '회원에게 푸시 알림 발송',
        path: '/admin-push',
        icon: IoNotificationsOutline,
        color: '#FF9500',
        bg: '#FFF5E6',
      },
      {
        id: 'mini-games',
        label: '미니 게임',
        desc: '게임 목록 및 플레이',
        path: '/mini-games',
        icon: IoGameControllerOutline,
        color: '#FF3B30',
        bg: '#FFEBEA',
      },
      {
        id: 'game-settings',
        label: '게임 설정',
        desc: '게임 활성화, 포인트 비율 설정',
        path: '/admin-game-settings',
        icon: IoSettingsOutline,
        color: '#34C759',
        bg: '#E8F8EE',
      },
    ],
  },
  {
    id: 'content',
    title: '콘텐츠',
    items: [
      {
        id: 'fishing-log',
        label: '조업일지',
        desc: '출항·어획·매출 기록 및 월별 통계',
        path: '/admin-fishing-log',
        icon: IoFishOutline,
        color: '#00796B',
        bg: '#E0F2F1',
      },
      {
        id: 'photos',
        label: '조황사진 관리',
        desc: '선장 조황 업로드·승객 태깅, 커뮤니티 조황',
        path: '/admin-photos',
        icon: IoImageOutline,
        color: '#9C27B0',
        bg: '#F5E8FF',
      },
      {
        id: 'community',
        label: '커뮤니티 관리',
        desc: '댓글 포인트 규칙, 템플릿 설정',
        path: '/admin-community',
        icon: IoChatbubblesOutline,
        color: '#00BCD4',
        bg: '#E6F9FC',
      },
      {
        id: 'trip-guide',
        label: '출조 일정 관리',
        desc: '출조 일정 등록 및 수정',
        path: '/admin-trip-guide',
        icon: IoBoatOutline,
        color: '#007AFF',
        bg: '#EBF1FE',
      },
      {
        id: 'reservations',
        label: '출조 예약 관리',
        desc: '예약 승인·거절 및 예약자 목록',
        path: '/admin-reservations',
        icon: IoCalendarOutline,
        color: '#237FFF',
        bg: '#EDF5FF',
      },
      {
        id: 'point-mall',
        label: '포인트몰 관리',
        desc: '상품 등록, 포인트 가격·재고 설정',
        path: '/admin-point-mall',
        icon: IoStorefrontOutline,
        color: '#5856D6',
        bg: '#EEEDFC',
      },
    ],
  },
  {
    id: 'settings',
    title: '설정',
    items: [
      {
        id: 'departure-info',
        label: '출항 정보',
        desc: '월별·연간 출항 확정 횟수',
        path: '/admin-departure-info',
        icon: IoBoatOutline,
        color: '#1B6FF5',
        bg: '#EBF1FE',
      },
      {
        id: 'site',
        label: '사이트 설정',
        desc: '사이트명, 메뉴, 하단 탭 설정',
        path: '/admin-site-settings',
        icon: IoConstructOutline,
        color: '#795548',
        bg: '#F5EFEC',
      },
    ],
  },
];

/** 전환기 선장 실운영에 필요한 메뉴(회원·스탬프·명부·푸시) 포함 */
const CAPTAIN_MENU_IDS = new Set([
  'admin',
  'roster',
  'push',
  'fishing-log',
  'photos',
  'trip-guide',
  'mini-games',
]);

function menuSectionsForUser(isAdmin: boolean): MenuSection[] {
  if (isAdmin) return MENU_SECTIONS;
  return MENU_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => CAPTAIN_MENU_IDS.has(item.id)),
  })).filter((section) => section.items.length > 0);
}

export default function AdminMainPage() {
  const { navigateReplace, navigate } = useNavigation();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [isAdmin, setIsAdmin] = useState(true);
  const [menuSections, setMenuSections] = useState(MENU_SECTIONS);

  useEffect(() => {
    const checkAuth = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        navigateReplace('/login');
        return;
      }

      if (!appUser.isAdmin && !appUser.isCaptain) {
        navigateReplace('/main');
        return;
      }

      setIsAdmin(appUser.isAdmin);
      setMenuSections(menuSectionsForUser(appUser.isAdmin));
      setAdminName(appUser.name || (appUser.isAdmin ? '관리자' : '선장'));
      setLoading(false);
    };
    void checkAuth();
  }, [navigateReplace]);

  if (loading) {
    return (
      <div
        className="min-vh-100 d-flex align-items-center justify-content-center"
        style={{ backgroundColor: '#F7F8FA' }}
      >
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <SubPageFrame title={isAdmin ? '관리자' : '선장'} showBackButton={false} showMyPage={false}>
      <div
        className="mb-4 p-4"
        style={{
          background: 'linear-gradient(135deg, #1B6FF5 0%, #5B8DEF 100%)',
          borderRadius: 16,
          color: '#fff',
        }}
      >
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
            style={{ width: 52, height: 52, backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            <IoShieldCheckmarkOutline size={28} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, opacity: 0.9, fontFamily: FONT }}>
              {isAdmin ? '관리자 모드' : '선장 모드'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT, marginTop: 2 }}>
              {adminName}님
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, fontFamily: FONT, marginTop: 4 }}>
              {isAdmin
                ? '회원·콘텐츠·게임·포인트몰을 관리할 수 있습니다.'
                : '승선명부·조업일지·조황 콘텐츠를 관리할 수 있습니다.'}
            </div>
          </div>
        </div>
      </div>

      {menuSections.map(section => (
        <div key={section.id} className="mb-4">
          <div className="mb-2 px-1">
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
              {section.title}
            </span>
          </div>
          <div style={CARD}>
            {section.items.map(({ id, label, desc, path, icon: Icon, color, bg }, idx) => (
              <div key={id}>
                {idx > 0 && (
                  <div style={OHGO_LIST_DIVIDER} />
                )}
                <button
                  type="button"
                  onClick={() => navigate(path)}
                  className="btn ohgo-menu-list-row"
                >
                  <div className="ohgo-menu-list-row__icon" style={{ backgroundColor: bg }}>
                    <Icon size={OHGO_LIST.iconGlyph} color={color} />
                  </div>
                  <div className="flex-grow-1 min-w-0">
                    <div className="ohgo-menu-list-row__title text-truncate">{label}</div>
                    <div className="ohgo-menu-list-row__desc text-truncate">{desc}</div>
                  </div>
                  <IoChevronForwardOutline
                    size={OHGO_LIST.chevronSize}
                    color={OHGO_LIST.chevronColor}
                    className="flex-shrink-0"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => navigate('/main')}
        className="btn w-100 d-flex align-items-center justify-content-center gap-2 fw-semibold"
        style={{
          backgroundColor: '#FFFFFF',
          color: '#1B6FF5',
          borderRadius: 14,
          padding: '14px',
          border: '2px solid #EBF1FE',
          fontFamily: FONT,
          fontSize: 15,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <IoHomeOutline size={20} color="#1B6FF5" />
        회원 홈으로
      </button>
    </SubPageFrame>
  );
}
