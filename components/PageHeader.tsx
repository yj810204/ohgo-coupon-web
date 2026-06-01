'use client';

import { useEffect } from 'react';
import { IoChevronBackOutline, IoPersonOutline } from 'react-icons/io5';
import { useNavigation } from '@/hooks/useNavigation';

interface PageHeaderProps {
  title: string;
  showBackButton?: boolean;
  onBack?: () => void;
  showMyPage?: boolean;
}

const FONT = "'Urbanist', var(--font-urbanist), system-ui, sans-serif";

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
      {/* 고정 헤더 */}
      <div
        className="page-header"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          width: '100%',
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #EFEFEF',
          boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
        }}
      >
        <div className="container" style={{ maxWidth: 480 }}>
          <div className="d-flex align-items-center" style={{ height: 56 }}>
            {showBackButton ? (
              <button
                type="button"
                onClick={handleBack}
                className="btn p-0 me-2 d-flex align-items-center justify-content-center"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: 'none',
                  background: '#F7F8FA',
                  color: '#1A1D1F',
                  flexShrink: 0,
                }}
                aria-label="뒤로"
              >
                <IoChevronBackOutline size={22} />
              </button>
            ) : (
              <div style={{ width: 36, flexShrink: 0 }} />
            )}

            <h5
              className="mb-0 flex-grow-1 text-center"
              style={{
                fontSize: '17px',
                fontWeight: 700,
                color: '#1A1D1F',
                fontFamily: FONT,
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </h5>

            {showMyPage ? (
              <button
                type="button"
                onClick={() => navigate('/my-page')}
                className="btn p-0 ms-2 d-flex align-items-center justify-content-center"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: 'none',
                  background: '#F7F8FA',
                  color: '#1A1D1F',
                  flexShrink: 0,
                }}
                aria-label="마이페이지"
              >
                <IoPersonOutline size={22} />
              </button>
            ) : (
              <div style={{ width: 36, flexShrink: 0 }} />
            )}
          </div>
        </div>
      </div>
      {/* 고정 헤더 높이만큼 콘텐츠 밀어내는 스페이서 */}
      <div style={{ height: 56 }} aria-hidden="true" />
    </>
  );
}
