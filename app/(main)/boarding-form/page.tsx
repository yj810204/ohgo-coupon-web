'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { getUser } from '@/lib/storage';
import { resolveAppUser } from '@/lib/auth-session';
import { getBoardingForm, saveBoardingForm } from '@/utils/boarding-service';
import { normalizePersonName } from '@/lib/person-name';
import BoardingInfoFields, {
  EMPTY_BOARDING_INFO,
  type BoardingInfoValues,
} from '@/components/boarding/BoardingInfoFields';
import SubPageFrame from '@/components/SubPageFrame';
import OhgoModal, { OhgoModalButton, OhgoModalCancelLink, OhgoModalText } from '@/components/OhgoModal';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OhgoPageLoading,
} from '@/lib/page-styles';
import { OHGO_ISOLATED_HTML_WORD_BREAK_CSS } from '@/lib/html-word-break';

const PRIVACY_POLICY_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @font-face { font-family: 'ONE Mobile'; src: url('/fonts/onemobile/ONEMobile-Regular.woff2') format('woff2'); font-weight: 400 500; font-display: swap; unicode-range: U+0000-00A8, U+00AA-10FFFF; }
    @font-face { font-family: 'ONE Mobile'; src: url('/fonts/onemobile/ONEMobile-Bold.woff2') format('woff2'); font-weight: 600 800; font-display: swap; unicode-range: U+0000-00A8, U+00AA-10FFFF; }
    @font-face { font-family: 'ONE Mobile Title'; src: url('/fonts/onemobile/ONEMobileTitle.woff2') format('woff2'); font-weight: 400; font-display: swap; unicode-range: U+0000-00A8, U+00AA-10FFFF; }
    body { font-family: 'ONE Mobile', 'Noto Sans KR', sans-serif; padding: 20px; line-height: 1.6; }
    h1, h2 { font-family: 'ONE Mobile Title', 'ONE Mobile', 'Noto Sans KR', sans-serif; font-weight: 400; }
    h1 { color: #1e88e5; }
    h2 { color: #333; margin-top: 20px; }
    ${OHGO_ISOLATED_HTML_WORD_BREAK_CSS}
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
    @font-face { font-family: 'ONE Mobile'; src: url('/fonts/onemobile/ONEMobile-Regular.woff2') format('woff2'); font-weight: 400 500; font-display: swap; unicode-range: U+0000-00A8, U+00AA-10FFFF; }
    @font-face { font-family: 'ONE Mobile'; src: url('/fonts/onemobile/ONEMobile-Bold.woff2') format('woff2'); font-weight: 600 800; font-display: swap; unicode-range: U+0000-00A8, U+00AA-10FFFF; }
    @font-face { font-family: 'ONE Mobile Title'; src: url('/fonts/onemobile/ONEMobileTitle.woff2') format('woff2'); font-weight: 400; font-display: swap; unicode-range: U+0000-00A8, U+00AA-10FFFF; }
    body { font-family: 'ONE Mobile', 'Noto Sans KR', sans-serif; padding: 20px; line-height: 1.6; }
    h1, h2 { font-family: 'ONE Mobile Title', 'ONE Mobile', 'Noto Sans KR', sans-serif; font-weight: 400; }
    h1 { color: #1e88e5; }
    h2 { color: #333; margin-top: 20px; }
    ${OHGO_ISOLATED_HTML_WORD_BREAK_CSS}
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

  const [form, setForm] = useState<BoardingInfoValues>(EMPTY_BOARDING_INFO);
  const patchForm = useCallback((patch: Partial<BoardingInfoValues>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);
  const { name, birth, gender, phone, emergency, address, addressDetail, role } = form;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [agreedThirdParty, setAgreedThirdParty] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showThirdPartyModal, setShowThirdPartyModal] = useState(false);
  const [showConsentSheet, setShowConsentSheet] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const formatSignupDob = (raw?: string | null) => {
      if (!raw) return '';
      const cleaned = String(raw).replace(/\D/g, '');
      if (cleaned.length === 8) {
        return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
      }
      return String(raw);
    };

    const loadData = async () => {
      try {
        const urlName = paramName ? decodeURIComponent(paramName) : '';
        const urlDob = dob ? formatSignupDob(decodeURIComponent(dob)) : '';
        if (urlName) patchForm({ name: urlName });
        if (urlDob) patchForm({ birth: urlDob });

        let userUuid = '';

        const appUser = await resolveAppUser();
        const localUser = await getUser();
        if (appUser?.isAdmin || localUser?.isAdmin) {
          setIsAdmin(true);
        }

        if (uuid) {
          userUuid = uuid.toString();
        } else if (appUser?.uuid) {
          userUuid = appUser.uuid;
        } else if (localUser?.uuid) {
          userUuid = localUser.uuid;
        }

        const signupName = (appUser?.name || localUser?.name || '').trim();
        const signupDob = formatSignupDob(appUser?.dob || localUser?.dob);
        const editingOther = Boolean(uuid && (appUser?.uuid || localUser?.uuid) && uuid !== (appUser?.uuid || localUser?.uuid));

        if (userUuid) {
          const record = await getBoardingForm(userUuid);
          if (record) {
            setForm({
              name: record.name || urlName || '',
              birth: record.birth || urlDob || '',
              gender: record.gender || '',
              phone: record.phone || '',
              emergency: record.emergency || '',
              address: record.address || '',
              addressDetail: record.addressDetail || '',
              role: record.tripRole || '',
            });
            setAgreed(record.agreed);
            setAgreedThirdParty(record.agreedThirdParty);
          } else if (!editingOther) {
            if (!urlName && signupName) patchForm({ name: signupName });
            if (!urlDob && signupDob) patchForm({ birth: signupDob });
          }
        }
      } catch (e) {
        console.warn('불러오기 오류:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [uuid, paramName, dob, patchForm]);

  const persistBoarding = async (consent: { agreed: boolean; agreedThirdParty: boolean }) => {
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

      await saveBoardingForm(
        userUuid,
        {
          name: normalizePersonName(name),
          birth,
          gender,
          phone,
          emergency,
          address,
          addressDetail: addressDetail.trim() || undefined,
          agreed: consent.agreed,
          agreedThirdParty: consent.agreedThirdParty,
          tripRole: isAdmin && role ? role : undefined,
        },
        { updateProfileRole: true, isAdmin },
      );

      alert('승선 정보가 저장되었습니다.');

      if (returnTo === 'roster-list' && date && dateDisplay && tripNumber) {
        router.replace(`/roster-list?date=${date}&dateDisplay=${encodeURIComponent(dateDisplay)}&tripNumber=${tripNumber}`);
      } else if (returnTo === 'member-detail' && uuid) {
        router.replace(
          `/member-detail?uuid=${uuid}&name=${encodeURIComponent(name)}&dob=${dob || birth.replace(/\D/g, '')}`
        );
      } else {
        router.replace('/main');
      }
    } catch (e) {
      console.error('저장 오류:', e);
      alert('정보 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!name || !birth || !gender || !phone || !emergency || !address) {
      alert('모든 항목을 빠짐없이 입력해 주세요.');
      return;
    }

    const birthClean = birth.replace(/-/g, '');
    if (!/^[0-9]{6}$|^[0-9]{8}$/.test(birthClean)) {
      alert('생년월일은 6자리 또는 8자리여야 합니다.');
      return;
    }

    if (agreed && agreedThirdParty) {
      void persistBoarding({ agreed: true, agreedThirdParty: true });
      return;
    }

    setShowConsentSheet(true);
  };

  const handleConsentConfirm = () => {
    setAgreed(true);
    setAgreedThirdParty(true);
    setShowConsentSheet(false);
    void persistBoarding({ agreed: true, agreedThirdParty: true });
  };

  if (loading) {
    return <OhgoPageLoading />;
  }

  return (
    <SubPageFrame title="명부 작성">
      <div className="p-3 mb-3 ohgo-boarding-card" style={OHGO_CARD}>
        <BoardingInfoFields values={form} onChange={patchForm} showRole={isAdmin} />
      </div>

      <button
        type="button"
        className={`btn w-100 d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
        style={{
          ...OHGO_CONFIRM_BTN,
          opacity: isSubmitting ? 0.65 : 1,
        }}
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            <span>저장 중...</span>
          </>
        ) : (
          '저장'
        )}
      </button>

      <OhgoModal
        open={showConsentSheet}
        onClose={() => setShowConsentSheet(false)}
        title="개인정보 동의"
        closeOnBackdrop
        footer={
          <>
            <OhgoModalButton onClick={handleConsentConfirm} disabled={isSubmitting}>
              {isSubmitting ? '저장 중...' : '동의하고 저장'}
            </OhgoModalButton>
            <OhgoModalCancelLink onClick={() => setShowConsentSheet(false)} />
          </>
        }
      >
        <OhgoModalText>
          승선명부 저장을 위해 개인정보 수집·이용 및 제3자 제공에 동의하시겠습니까?
        </OhgoModalText>
        <div className="mt-2 d-flex flex-column" style={{ gap: 2 }}>
          <button
            type="button"
            className="btn btn-link p-0 text-start text-decoration-underline"
            onClick={() => setShowPrivacyModal(true)}
            style={{
              fontSize: 14,
              color: '#1B6FF5',
              fontFamily: OHGO_FONT,
              lineHeight: 1.35,
              minHeight: 0,
              padding: '2px 0',
            }}
          >
            개인정보 수집 및 이용 내용 보기
          </button>
          <button
            type="button"
            className="btn btn-link p-0 text-start text-decoration-underline"
            onClick={() => setShowThirdPartyModal(true)}
            style={{
              fontSize: 14,
              color: '#1B6FF5',
              fontFamily: OHGO_FONT,
              lineHeight: 1.35,
              minHeight: 0,
              padding: '2px 0',
            }}
          >
            제3자 개인정보 제공 내용 보기
          </button>
        </div>
      </OhgoModal>

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
