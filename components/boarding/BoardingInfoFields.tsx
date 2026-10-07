'use client';

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { IoSearchOutline } from 'react-icons/io5';
import PostcodeSearchModal, { usePostcodeScript } from '@/components/PostcodeSearchModal';
import { OHGO_FONT, OHGO_INPUT } from '@/lib/page-styles';

export type BoardingInfoValues = {
  name: string;
  birth: string;
  gender: string;
  phone: string;
  emergency: string;
  address: string;
  addressDetail: string;
  role: string;
};

export const EMPTY_BOARDING_INFO: BoardingInfoValues = {
  name: '',
  birth: '',
  gender: '',
  phone: '',
  emergency: '',
  address: '',
  addressDetail: '',
  role: '',
};

export function formatPhoneInput(text: string): string {
  const cleaned = text.replace(/\D/g, '');
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
}

export function formatBirthInput(text: string): string {
  const cleaned = text.replace(/\D/g, '');
  if (cleaned.length <= 4) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
}

export const BOARDING_FIELD_LABEL: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: '#6F767E',
  fontFamily: OHGO_FONT,
  marginBottom: 8,
};

const PILL_RADIUS = 9999;

const FIELD: CSSProperties = { ...OHGO_INPUT, width: '100%', backgroundColor: '#FFFFFF' };

const segmentInactiveStyle: CSSProperties = {
  backgroundColor: '#F7F8FA',
  color: '#6F767E',
  border: '1.5px solid #C2C6CE',
};

const segmentActiveStyle: CSSProperties = {
  backgroundColor: '#1B6FF5',
  color: '#FFFFFF',
  border: '1.5px solid #1B6FF5',
};

const pillFieldStyle: CSSProperties = {
  borderRadius: PILL_RADIUS,
  border: '1.5px solid #C2C6CE',
  padding: '10px 16px',
  fontFamily: OHGO_FONT,
  fontSize: 14,
  color: '#1A1D1F',
  outline: 'none',
  boxShadow: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

function SegmentButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex-fill"
      style={{
        ...(active ? segmentActiveStyle : segmentInactiveStyle),
        borderRadius: PILL_RADIUS,
        padding: '10px 12px',
        fontFamily: OHGO_FONT,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** 이름 · 생년월일 · 성별 · 연락처 · 비상 연락처 · 주소 · 상세 주소 · 역할(관리자만) */
export default function BoardingInfoFields({
  values,
  onChange,
  showRole = false,
}: {
  values: BoardingInfoValues;
  onChange: (patch: Partial<BoardingInfoValues>) => void;
  showRole?: boolean;
}) {
  const [showPostcodeModal, setShowPostcodeModal] = useState(false);
  const addressDetailRef = useRef<HTMLTextAreaElement>(null);

  usePostcodeScript();

  const openAddressSearch = useCallback(() => {
    if (!window.daum?.Postcode && !document.getElementById('daum-postcode-script')) {
      alert('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    setShowPostcodeModal(true);
  }, []);

  const applySelectedAddress = (fullAddress: string) => {
    onChange({ address: fullAddress, addressDetail: '' });
    setShowPostcodeModal(false);
    window.setTimeout(() => addressDetailRef.current?.focus(), 150);
  };

  return (
    <>
      <div className="mb-3">
        <label style={BOARDING_FIELD_LABEL}>이름 *</label>
        <input
          type="text"
          placeholder="홍길동"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={FIELD}
        />
      </div>

      <div className="mb-3">
        <label style={BOARDING_FIELD_LABEL}>생년월일 *</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="예: 19900101"
          value={values.birth}
          onChange={(e) => onChange({ birth: formatBirthInput(e.target.value) })}
          maxLength={10}
          style={FIELD}
        />
      </div>

      <div className="mb-3">
        <label style={BOARDING_FIELD_LABEL}>성별 *</label>
        <div className="ohgo-stack-pair">
          <SegmentButton label="남" active={values.gender === '남'} onClick={() => onChange({ gender: '남' })} />
          <SegmentButton label="여" active={values.gender === '여'} onClick={() => onChange({ gender: '여' })} />
        </div>
      </div>

      <div className="mb-3">
        <label style={BOARDING_FIELD_LABEL}>연락처 *</label>
        <input
          type="tel"
          value={values.phone}
          onChange={(e) => onChange({ phone: formatPhoneInput(e.target.value) })}
          maxLength={13}
          style={FIELD}
        />
      </div>

      <div className="mb-3">
        <label style={BOARDING_FIELD_LABEL}>비상 연락처 *</label>
        <input
          type="tel"
          value={values.emergency}
          onChange={(e) => onChange({ emergency: formatPhoneInput(e.target.value) })}
          maxLength={13}
          style={FIELD}
        />
      </div>

      <div className="mb-3">
        <label style={BOARDING_FIELD_LABEL}>주소 *</label>
        <div className="ohgo-stack-pair mb-2">
          <input
            type="text"
            placeholder="주소 검색 버튼을 눌러주세요"
            value={values.address}
            readOnly
            className="flex-grow-1 min-w-0"
            style={{
              ...pillFieldStyle,
              backgroundColor: values.address ? '#FFFFFF' : '#F7F8FA',
              cursor: 'default',
            }}
          />
          <button
            type="button"
            onClick={openAddressSearch}
            className="d-flex align-items-center justify-content-center gap-1 flex-shrink-0"
            style={{
              ...segmentActiveStyle,
              borderRadius: PILL_RADIUS,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              fontFamily: OHGO_FONT,
              cursor: 'pointer',
            }}
          >
            <IoSearchOutline size={16} />
            검색
          </button>
        </div>
        <textarea
          ref={addressDetailRef}
          rows={3}
          placeholder={values.address ? '상세 주소 입력 (동/호수 등)' : '주소 검색 후 상세 주소를 입력하세요'}
          value={values.addressDetail}
          onChange={(e) => onChange({ addressDetail: e.target.value })}
          autoComplete="address-line2"
          className="w-100"
          style={{ ...FIELD, resize: 'vertical', minHeight: 72 }}
        />
      </div>

      {showRole && (
        <div className="mb-3">
          <label style={BOARDING_FIELD_LABEL}>역할</label>
          <div className="d-flex gap-2">
            <SegmentButton label="선장" active={values.role === 'captain'} onClick={() => onChange({ role: 'captain' })} />
            <SegmentButton label="선원" active={values.role === 'sailor'} onClick={() => onChange({ role: 'sailor' })} />
            <SegmentButton label="없음" active={values.role === 'none'} onClick={() => onChange({ role: 'none' })} />
          </div>
        </div>
      )}

      <PostcodeSearchModal
        open={showPostcodeModal}
        onClose={() => setShowPostcodeModal(false)}
        onSelect={applySelectedAddress}
      />
    </>
  );
}
