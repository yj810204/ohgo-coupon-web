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

export default function PageHeader({ title, showBackButton = true, onBack, showMyPage = true }: PageHeaderProps) {
  const { navigateBack, navigate } = useNavigation();

  useEffect(() => {
    // PageHeader가 있을 때 body에 data 속성 추가 (CSS에서 padding-top 적용용)
    document.body.setAttribute('data-has-page-header', 'true');
    
    return () => {
      document.body.removeAttribute('data-has-page-header');
    };
  }, []);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigateBack();
    }
  };

  return (
    <div 
      className="bg-white border-bottom shadow-sm page-header"
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        width: '100%',
      }}
    >
      <div className="container">
        <div className="d-flex align-items-center py-3">
          {showBackButton && (
            <button
              type="button"
              className="btn btn-link p-0 me-3"
              onClick={handleBack}
              style={{ 
                border: 'none', 
                background: 'none',
                color: '#333',
                fontSize: '1.5rem',
                lineHeight: 1
              }}
            >
              <IoChevronBackOutline size={24} />
            </button>
          )}
          <h5 className="mb-0 fw-bold flex-grow-1">{title}</h5>
          {showMyPage && (
            <button
              type="button"
              className="btn btn-link p-0"
              onClick={() => navigate('/my-page')}
              style={{ 
                border: 'none', 
                background: 'none',
                color: '#333',
                fontSize: '1.5rem',
                lineHeight: 1
              }}
              title="마이페이지"
            >
              <IoPersonOutline size={24} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

