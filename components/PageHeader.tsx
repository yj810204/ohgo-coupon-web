'use client';

import { useEffect } from 'react';
import { IoChevronBackOutline, IoPersonOutline } from 'react-icons/io5';
import { useNavigation } from '@/hooks/useNavigation';
import type { PageHeaderAction } from '@/lib/page-header-action';

interface PageHeaderProps {
  title?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  showMyPage?: boolean;
  /** 있으면 우상단 아이콘을 이 액션으로 대체. 없으면 마이페이지(기본) */
  headerAction?: PageHeaderAction | null;
}

export type { PageHeaderAction };

export default function PageHeader({
  title,
  showBackButton = true,
  onBack,
  showMyPage = true,
  headerAction,
}: PageHeaderProps) {
  const { navigateBack, navigate } = useNavigation();

  useEffect(() => {
    document.body.setAttribute('data-has-page-header', 'true');
    return () => {
      document.body.removeAttribute('data-has-page-header');
    };
  }, []);

  const handleBack = () => {
    if (onBack) onBack();
    else navigateBack();
  };

  const fallbackAction: PageHeaderAction | null = showMyPage
    ? {
        ariaLabel: '마이페이지',
        onClick: () => navigate('/my-page'),
        icon: IoPersonOutline,
      }
    : null;
  const action = headerAction ?? fallbackAction;
  const ActionIcon = action?.icon;

  return (
    <>
      <header className="ohgo-page-header">
        <div className="container" style={{ maxWidth: 'var(--ohgo-app-max-width)' }}>
          <div className="ohgo-page-header__bar">
            <div className="ohgo-page-header__side">
              {showBackButton && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="btn p-0 d-flex align-items-center justify-content-center ohgo-page-header__icon-btn"
                  aria-label="뒤로"
                >
                  <IoChevronBackOutline size={22} />
                </button>
              )}
            </div>
            {title ? (
              <h1 className="ohgo-page-header__title">{title}</h1>
            ) : (
              <div className="ohgo-page-header__title-spacer" aria-hidden="true" />
            )}
            <div className="ohgo-page-header__side ohgo-page-header__side--end">
              {action && ActionIcon ? (
                <button
                  type="button"
                  onClick={action.onClick}
                  className="btn p-0 d-flex align-items-center justify-content-center ohgo-page-header__icon-btn"
                  aria-label={action.ariaLabel}
                >
                  <ActionIcon size={22} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <div className="ohgo-page-header-spacer" aria-hidden="true" />
    </>
  );
}
