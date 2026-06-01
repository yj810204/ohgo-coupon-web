'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { IoImageOutline, IoBoatOutline, IoChevronForwardOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';
import { useNavigation } from '@/hooks/useNavigation';

const FONT = "'Urbanist', var(--font-urbanist), sans-serif";

interface SubMenuItem {
  id: string;
  label: string;
  desc: string;
  path: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  bg: string;
}

const subMenuItems: SubMenuItem[] = [
  {
    id: 'photos',
    label: '조황 사진',
    desc: '낚시 조황 사진을 공유하세요',
    path: '/community/photos',
    icon: IoImageOutline,
    color: '#9C27B0',
    bg: '#F5E8FF',
  },
  {
    id: 'trip-guide',
    label: '출조 안내',
    desc: '출조 일정과 정보를 확인하세요',
    path: '/community/trip-guide',
    icon: IoBoatOutline,
    color: '#1B6FF5',
    bg: '#EBF1FE',
  },
];

export default function CommunityPage() {
  const router = useRouter();
  const { navigate } = useNavigation();

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) router.replace('/login');
    };
    checkAuth();
  }, [router]);

  return (
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <PageHeader title="커뮤니티" />
      <div className="container py-3" style={{ maxWidth: 480 }}>

        <p style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT, marginBottom: 20 }}>
          낚시 커뮤니티에 참여하고 정보를 나눠보세요.
        </p>

        <div className="d-flex flex-column gap-3">
          {subMenuItems.map(({ id, label, desc, path, icon: Icon, color, bg }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(path)}
              className="btn w-100 text-start d-flex align-items-center gap-3 p-3"
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                border: 'none',
              }}
            >
              <div
                className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 52, height: 52, backgroundColor: bg }}
              >
                <Icon size={26} color={color} />
              </div>
              <div className="flex-grow-1">
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>{label}</div>
                <div style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 2 }}>{desc}</div>
              </div>
              <IoChevronForwardOutline size={20} color="#ABABAB" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
