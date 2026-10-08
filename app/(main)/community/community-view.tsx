'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { useAuth } from '@/contexts/AuthContext';
import { shouldLeaveCommunityForLogin } from '@/lib/community-entry';
import { peekStoredAppUser } from '@/lib/auth-session';
import { IoImageOutline, IoBoatOutline, IoHelpCircleOutline, IoBookOutline, IoChevronForwardOutline, IoWaterOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import AppLink from '@/components/AppLink';
import { countPhotos } from '@/utils/community-service';
import { OHGO_CARD, OHGO_LIST, OHGO_LIST_DIVIDER } from '@/lib/page-styles';
import type { PublicCommunityCounts } from '@/lib/public-feed-types';

const FONT = "var(--font-ohgo), sans-serif";

const subMenuItems = [
  {
    id: 'photos',
    label: '조황 사진',
    desc: '최근 출조 현장의 사진',
    path: '/community/photos',
    icon: IoImageOutline,
    color: '#9C27B0',
    bg: '#F5E8FF',
  },
  {
    id: 'faq',
    label: '낚시 팁 · FAQ',
    desc: '출조 준비와 자주 묻는 질문',
    path: '/community/faq',
    icon: IoBookOutline,
    color: '#E65100',
    bg: '#FFF4E5',
  },
  {
    id: 'qna',
    label: '낚시 Q&A',
    desc: '낚시에 대한 질문과 답변',
    path: '/community/qna',
    icon: IoHelpCircleOutline,
    color: '#00BCD4',
    bg: '#E6F9FC',
  },
  {
    id: 'trip-guide',
    label: '출조 안내',
    desc: '이번 주 출조 일정과 출항지',
    path: '/community/trip-guide',
    icon: IoBoatOutline,
    color: '#1B6FF5',
    bg: '#EBF1FE',
  },
  {
    id: 'tide',
    label: '물때 · 날씨',
    desc: '오늘 물때와 바람의 AI 브리핑',
    path: '/tide',
    icon: IoWaterOutline,
    color: '#0F4C81',
    bg: '#E8F0F8',
  },
];

export default function CommunityPage({
  initialCounts = null,
}: {
  initialCounts?: PublicCommunityCounts | null;
}) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [counts, setCounts] = useState<Partial<Record<string, number>>>(
    initialCounts
      ? { photos: initialCounts.photos, faq: initialCounts.faq, qna: initialCounts.qna }
      : {},
  );

  useEffect(() => {
    if (
      !shouldLeaveCommunityForLogin({
        authReady: ready,
        authUserId: user?.uuid,
        storedUserId: peekStoredAppUser()?.uuid,
      })
    ) {
      return;
    }
    router.replace('/login');
  }, [ready, user, router]);

  useEffect(() => {
    const loadCounts = async () => {
      try {
        const [photos, faq, qna] = await Promise.all([
          countPhotos('photo'),
          countPhotos('faq'),
          countPhotos('qna'),
        ]);
        setCounts({ photos, faq, qna });
      } catch (error) {
        console.error(error);
      }
    };
    void loadCounts();
  }, []);

  return (
    <SubPageFrame title="커뮤니티">
      <p style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT, marginBottom: 20 }}>
        낚시 커뮤니티에 참여하고 정보를 나눠보세요.
      </p>

      <div style={OHGO_CARD}>
        {subMenuItems.map(({ id, label, desc, path, icon: Icon, color, bg }, idx) => (
          <div key={id}>
            {idx > 0 && <div style={OHGO_LIST_DIVIDER} />}
            <AppLink href={path} className="btn ohgo-menu-list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="ohgo-menu-list-row__icon" style={{ backgroundColor: bg }}>
                <Icon size={OHGO_LIST.iconGlyph} color={color} />
              </div>
              <div className="flex-grow-1 min-w-0">
                <div className="ohgo-menu-list-row__title">
                  {counts[id] == null ? label : `${label} (${counts[id]})`}
                </div>
                <div className="ohgo-menu-list-row__desc">{desc}</div>
              </div>
              <IoChevronForwardOutline
                size={OHGO_LIST.chevronSize}
                color={OHGO_LIST.chevronColor}
              />
            </AppLink>
          </div>
        ))}
      </div>
    </SubPageFrame>
  );
}
