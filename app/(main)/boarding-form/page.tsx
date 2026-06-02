'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getDoc, setDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { IoCheckboxOutline, IoSquareOutline, IoSearchOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import { OHGO_CARD, OHGO_FONT, OhgoPageLoading } from '@/lib/page-styles';

// 다음 우편번호 API 타입 선언
declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: { address: string; addressType: string; bname: string; buildingName: string }) => void;
      }) => { open: () => void };
    };
  }
}

const PRIVACY_POLICY_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
    h1 { color: #1e88e5; }
    h2 { color: #333; margin-top: 20px; }
  </style>
</head>
<body>
  <p>오고피씽 서비스를 이용해 주셔서 감사합니다. 본 서비스는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」을 준수하고 있습니다.</p>
  <h2>1. 수집하는 개인정보 항목</h2>
  <p>회사는 서비스 제공을 위해 다음과 같은 개인정보를 수집하고 있습니다: 이름, 생년월일, 성별, 연락처, 비상 연락처, 주소</p>
  <h2>2. 개인정보의 수집 및 이용목적</h2>
  <p>서비스 제공, 회원 관리, 안전 관리 등의 목적으로 개인정보를 수집합니다.</p>
  <h2>3. 개인정보의 보유 및 이용기간</h2>
  <p>원칙적으로 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.</p>
  <h2>4. 동의 거부권 및 거부 시 불이익</h2>
  <p>귀하는 개인정보 수집 및 이용에 대한 동의를 거부할 권리가 있습니다. 다만, 동의를 거부할 경우 서비스 이용이 제한될 수 있습니다.</p>
</body>
</html>
`;

const THIRD_PARTY_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
    h1 { color: #1e88e5; }
    h2 { color: #333; margin-top: 20px; }
  </style>
</head>
<body>
  <p>오고피씽 서비스는 원활한 서비스 제공 및 안전한 승선 관리를 위해 아래와 같이 개인정보를 제3자에게 제공하고 있습니다.</p>
  <h2>1. 개인정보를 제공받는 자</h2>
  <p>해양경찰청</p>
  <h2>2. 제공하는 개인정보 항목</h2>
  <p>이름, 생년월일, 성별, 연락처, 주소 등</p>
  <h2>3. 개인정보를 제공받는 자의 개인정보 보유 및 이용기간</h2>
  <p>개인정보를 제공받는 자는 개인정보를 제공받은 날로부터 동의 철회 시 또는 제공 목적을 달성할 때까지 보유 및 이용합니다.</p>
  <h2>4. 동의 거부권 및 거부 시 불이익</h2>
  <p>귀하는 개인정보 제공에 대한 동의를 거부할 권리가 있습니다. 다만, 동의를 거부할 경우 서비스 이용이 제한될 수 있습니다.</p>
</body>
</html>
`;

function BoardingFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uuid = searchParams.get('uuid');
  const paramName = searchParams.get('name');
  const dob = searchParams.get('dob');
  const returnTo = searchParams.get('returnTo');
  const date = searchParams.get('date');
  const dateDisplay = searchParams.get('dateDisplay');
  const tripNumber = searchParams.get('tripNumber');

  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [emergency, setEmergency] = useState('');
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [agreedThirdParty, setAgreedThirdParty] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showThirdPartyModal, setShowThirdPartyModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // 다음 우편번호 스크립트 로드
  useEffect(() => {
    if (document.getElementById('daum-postcode-script')) return;
    const script = document.createElement('script');
    script.id = 'daum-postcode-script';
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const openAddressSearch = useCallback(() => {
    if (!window.daum?.Postcode) {
      alert('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        let fullAddress = data.address;
        if (data.addressType === 'R') {
          if (data.bname) fullAddress += ` (${data.bname}`;
          if (data.buildingName) fullAddress += data.bname ? `, ${data.buildingName})` : ` (${data.buildingName})`;
          else if (data.bname) fullAddress += ')';
        }
        setAddress(fullAddress);
        setAddressDetail('');
      },
    }).open();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Set initial values from params if available
        if (paramName) setName(decodeURIComponent(paramName));
        if (dob) setBirth(decodeURIComponent(dob));

        let userUuid = '';

        // Check if logged-in user is admin
        const loggedInUser = await getUser();
        if (loggedInUser?.uuid) {
          const loggedInUserDoc = await getDoc(doc(db, 'users', loggedInUser.uuid));
          if (loggedInUserDoc.exists()) {
            const loggedInUserData = loggedInUserDoc.data();
            setIsAdmin(!!loggedInUserData.isAdmin);
          }
        }

        // Load user data if UUID is provided
        if (uuid) {
          userUuid = uuid.toString();
          const snap = await getDoc(doc(db, 'users', userUuid, 'boarding', 'info'));
          if (snap.exists()) {
            const data = snap.data();
            setName(data.name || paramName || '');
            setBirth(data.birth || dob || '');
            setGender(data.gender || '');
            setPhone(data.phone || '');
            setEmergency(data.emergency || '');
            setAddress(data.address || '');
            setAgreed(!!data.agreed);
            setAgreedThirdParty(!!data.agreedThirdParty);
            setRole(data.role || '');
          }
        } else {
          // If no UUID provided, load logged-in user's data
      const user = await getUser();
          if (user?.uuid) {
            userUuid = user.uuid;
            const snap = await getDoc(doc(db, 'users', userUuid, 'boarding', 'info'));
            if (snap.exists()) {
              const data = snap.data();
              setName(data.name || '');
              setBirth(data.birth || '');
              setGender(data.gender || '');
              setPhone(data.phone || '');
              setEmergency(data.emergency || '');
              setAddress(data.address || '');
              setAgreed(!!data.agreed);
              setAgreedThirdParty(!!data.agreedThirdParty);
              setRole(data.role || '');
            }
          }
        }
      } catch (e) {
        console.warn('불러오기 오류:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [uuid, paramName, dob]);

  // Format phone number as user types
  const formatPhoneNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = '';
    if (cleaned.length <= 3) {
      formatted = cleaned;
    } else if (cleaned.length <= 7) {
      formatted = `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    } else {
      formatted = `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
    }
    return formatted;
  };

  // Format DOB as user types
  const formatDOB = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = '';
    if (cleaned.length <= 4) {
      formatted = cleaned;
    } else if (cleaned.length <= 6) {
      formatted = `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
    } else {
      formatted = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
    }
    return formatted;
  };

  const handleSubmit = async () => {
    if (!name || !birth || !gender || !phone || !emergency || !address) {
      alert('모든 항목을 빠짐없이 입력해 주세요.');
      return;
    }
    if (!agreed) {
      alert('개인정보 수집 및 이용에 동의하셔야 합니다.');
      return;
    }
    if (!agreedThirdParty) {
      alert('제3자 개인정보 제공에 동의하셔야 합니다.');
      return;
    }

    // Validate birth format
    const birthClean = birth.replace(/-/g, '');
    if (!/^[0-9]{6}$|^[0-9]{8}$/.test(birthClean)) {
      alert('생년월일은 6자리 또는 8자리여야 합니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Use the UUID from params if available, otherwise use the logged-in user's UUID
      let userUuid;
      if (uuid) {
        userUuid = uuid.toString();
      } else {
        const user = await getUser();
        if (!user?.uuid) throw new Error('UUID가 없습니다.');
        userUuid = user.uuid;
      }

      // Prepare boarding info data
      const boardingData: {
        name: string;
        birth: string;
        gender: string;
        phone: string;
        emergency: string;
        address: string;
        agreed: boolean;
        agreedThirdParty: boolean;
        role?: string;
      } = {
        name,
        birth,
        gender,
        phone,
        emergency,
        address: addressDetail ? `${address} ${addressDetail}` : address,
        agreed,
        agreedThirdParty,
      };

      // Add role field only if it's not 'none'
      if (isAdmin && role && role !== 'none') {
        boardingData.role = role;
      }

      await setDoc(doc(db, 'users', userUuid, 'boarding', 'info'), boardingData);

      // If user is admin and role is selected (and not 'none'), update the main user document with the role
      if (isAdmin && role && role !== 'none') {
        await setDoc(doc(db, 'users', userUuid), { role }, { merge: true });
      } else if (isAdmin && role === 'none') {
        // If 'none' is selected, remove the role field from the main user document
        await setDoc(doc(db, 'users', userUuid), { role: null }, { merge: true });
      }

      alert('승선 정보가 저장되었습니다.');

      // Navigate back to the appropriate screen
      if (returnTo === 'roster-list' && date && dateDisplay && tripNumber) {
        router.push(`/roster-list?date=${date}&dateDisplay=${encodeURIComponent(dateDisplay)}&tripNumber=${tripNumber}`);
      } else {
        router.back();
      }
    } catch (e) {
      console.error('저장 오류:', e);
      alert('정보 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <OhgoPageLoading />;
  }

  return (
    <SubPageFrame title="명부 작성">
        <div className="p-3" style={OHGO_CARD}>

            <div className="mb-3">
              <label className="form-label">이름 *</label>
              <input
                type="text"
                className="form-control"
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">생년월일 *</label>
              <input
                type="text"
                className="form-control"
                placeholder="예: 19900101"
                value={birth}
                onChange={(e) => setBirth(formatDOB(e.target.value))}
                maxLength={10}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">성별 *</label>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className={`btn flex-fill ${gender === '남' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setGender('남')}
                >
                  남
                </button>
                <button
                  type="button"
                  className={`btn flex-fill ${gender === '여' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setGender('여')}
                >
                  여
                </button>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">연락처 *</label>
              <input
                type="tel"
                className="form-control"
                value={phone}
                onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                maxLength={13}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">비상 연락처 *</label>
              <input
                type="tel"
                className="form-control"
                value={emergency}
                onChange={(e) => setEmergency(formatPhoneNumber(e.target.value))}
                maxLength={13}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">주소 *</label>
              <div className="d-flex gap-2 mb-2">
                <input
                  type="text"
                  className="form-control"
                  placeholder="주소 검색 버튼을 눌러주세요"
                  value={address}
                  readOnly
                  style={{ backgroundColor: address ? '#fff' : '#F7F8FA', cursor: 'default' }}
                />
                <button
                  type="button"
                  onClick={openAddressSearch}
                  className="btn d-flex align-items-center gap-1 flex-shrink-0 fw-semibold"
                  style={{
                    backgroundColor: '#1B6FF5',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 14px',
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                    fontFamily: "'Urbanist', var(--font-urbanist), sans-serif",
                  }}
                >
                  <IoSearchOutline size={15} />
                  검색
                </button>
              </div>
              {address && (
                <input
                  type="text"
                  className="form-control"
                  placeholder="상세 주소 입력 (동/호수 등)"
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                />
              )}
            </div>

            {isAdmin && (
              <div className="mb-3">
                <label className="form-label">역할</label>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className={`btn flex-fill ${role === 'captain' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setRole('captain')}
                  >
                    선장
                  </button>
                  <button
                    type="button"
                    className={`btn flex-fill ${role === 'sailor' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setRole('sailor')}
                  >
                    선원
                  </button>
                  <button
                    type="button"
                    className={`btn flex-fill ${role === 'none' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setRole('none')}
                  >
                    없음
                  </button>
                </div>
              </div>
            )}

            <div className="mb-3 d-flex align-items-start">
              <button
                type="button"
                className="btn btn-link p-0 me-2"
                onClick={() => setAgreed(!agreed)}
                style={{ border: 'none', background: 'none' }}
              >
                {agreed ? (
                  <IoCheckboxOutline size={22} color="#1e88e5" />
                ) : (
                  <IoSquareOutline size={22} color="#888" />
                )}
              </button>
              <div className="flex-grow-1">
                <span className="small">
                  <button
                    type="button"
                    className="btn btn-link p-0 text-primary text-decoration-underline"
                    onClick={() => setShowPrivacyModal(true)}
                    style={{ fontSize: 'inherit' }}
                  >
                    개인정보 수집 및 이용
                  </button>
                  에 동의합니다.
                </span>
              </div>
            </div>

            <div className="mb-3 d-flex align-items-start">
              <button
                type="button"
                className="btn btn-link p-0 me-2"
                onClick={() => setAgreedThirdParty(!agreedThirdParty)}
                style={{ border: 'none', background: 'none' }}
              >
                {agreedThirdParty ? (
                  <IoCheckboxOutline size={22} color="#1e88e5" />
                ) : (
                  <IoSquareOutline size={22} color="#888" />
                )}
              </button>
              <div className="flex-grow-1">
                <span className="small">
                  <button
                    type="button"
                    className="btn btn-link p-0 text-primary text-decoration-underline"
                    onClick={() => setShowThirdPartyModal(true)}
                    style={{ fontSize: 'inherit' }}
                  >
                    제3자 개인정보 제공
                  </button>
                  에 동의합니다.
                </span>
              </div>
            </div>

            <button
              className="btn btn-primary w-100"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  저장 중...
                </>
              ) : (
                '저장'
              )}
            </button>
        </div>

      {/* Privacy Modal */}
      <OhgoModal
        open={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="개인정보 수집 및 이용 동의"
        size="lg"
        scrollable
        closeOnBackdrop
        bodyPadding={false}
      >
        <iframe
          srcDoc={PRIVACY_POLICY_HTML}
          style={{ width: '100%', height: 'min(60vh, 500px)', border: 'none', display: 'block' }}
          title="개인정보 수집 및 이용 동의"
        />
      </OhgoModal>

      <OhgoModal
        open={showThirdPartyModal}
        onClose={() => setShowThirdPartyModal(false)}
        title="제3자 개인정보 제공 동의"
        size="lg"
        scrollable
        closeOnBackdrop
        bodyPadding={false}
      >
        <iframe
          srcDoc={THIRD_PARTY_HTML}
          style={{ width: '100%', height: 'min(60vh, 500px)', border: 'none', display: 'block' }}
          title="제3자 개인정보 제공 동의"
        />
      </OhgoModal>
    </SubPageFrame>
  );
}

export default function BoardingFormPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <BoardingFormContent />
    </Suspense>
  );
}
