'use client';

import { useRouter } from 'next/navigation';
import { IoChevronBackOutline } from 'react-icons/io5';

interface PageHeaderProps {
  title: string;
  showBackButton?: boolean;
  onBack?: () => void;
}

export default function PageHeader({ title, showBackButton = true, onBack }: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <div 
      className="bg-white border-bottom shadow-sm position-sticky"
      style={{ zIndex: 1000, top: 0 }}
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
        </div>
      </div>
    </div>
  );
}

