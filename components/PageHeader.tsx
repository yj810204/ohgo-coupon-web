'use client';

import { useEffect } from 'react';
import { IoChevronBackOutline, IoPersonOutline } from 'react-icons/io5';
import { useNavigation } from '@/hooks/useNavigation';

interface PageHeaderProps {
  title?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  showMyPage?: boolean;
}

export default function PageHeader({
  title,
  showBackButton = true,
  onBack,
  showMyPage = true,
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

  return (
    <>
      <header className="ohgo-page-header">
        <div className="container" style={{ maxWidth: 480 }}>
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
              {showMyPage && (
                <button
                  type="button"
                  onClick={() => navigate('/my-page')}
                  className="btn p-0 d-flex align-items-center justify-content-center ohgo-page-header__icon-btn"
                  aria-label="마이페이지"
                >
                  <IoPersonOutline size={22} />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
      <div className="ohgo-page-header-spacer" aria-hidden="true" />
    </>
  );
}
