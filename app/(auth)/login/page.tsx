'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginOrRegisterUser, getUserByUUID } from '@/lib/firebase-auth';
import { saveUser, getUser } from '@/lib/storage';
import { notifyAllAdmins } from '@/utils/send-push';
import { IoPersonOutline, IoCalendarOutline, IoDocumentTextOutline, IoCloseOutline } from 'react-icons/io5';

export default function LoginPage() {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

  // 로그인 상태 확인 - 이미 로그인되어 있으면 리다이렉트
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const localUser = await getUser();
        if (localUser?.uuid) {
          // Firestore에서 사용자 정보 확인
          const remoteUser = await getUserByUUID(localUser.uuid);
          if (remoteUser) {
            // 이미 로그인되어 있으면 적절한 페이지로 리다이렉트
            const targetPath = remoteUser.isAdmin ? '/admin-main' : '/main';
            router.replace(targetPath);
            return;
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setCheckingAuth(false);
      }
    };
    checkAuth();
  }, [router]);

  const privacyHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #1e88e5; }
        h2 { color: #333; margin-top: 20px; }
        hr { margin: 15px 0; border: 0; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <p>오고피씽은(는) 정보주체의 자유와 권리 보호를 위해 「개인정보 보호법」 및 관계 법령이 정한바를 준수하여, 적법하게 개인정보를 처리하고 안전하 기준을 안내하고, 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이 개인정보 처리방침을 수립·공개합니다.</p>
      
      <hr />
      <h2>개인정보의 처리목적</h2>
      <p>오고피씽은(는) 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적 보호법」 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.</p>
      <p>
        1. 회원 가입 및 관리<br>
        회원 가입의사 확인, 회원제 서비스 제공에 따른 본인 식별·인증, 회원자격 유지·관리, 서비스 부정이용 방지, 만 14세 미만 아동의 개인정보 처리 시 법정대리인의 동의여부 확인, 각종 고지·통지, 고충처리 목적으로 개인정보를 처리합니다.
      </p>
      
      <hr />
      <h2>개인정보의 처리 및 보유기간</h2>
      <p>
        ① 오고피씽은(는) 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터 개인정보를 수집 시에 동의 받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.<br><br>
        ② 각각의 개인정보 처리 및 보유 기간은 다음과 같습니다.<br>
        1. 어플리케이션 회원 가입 및 관리 : 어플리케이션 회원삭제(탈퇴) 시까지<br>
        다만, 다음의 사유에 해당하는 경우에는 해당 사유 종료 시까지<br>
        1) 관계 법령 위반에 따른 수사·조사 등이 진행 중인 경우에는 해당 수사·조사 종료 시까지
      </p>
      
      <hr />
      <h2>처리하는 개인정보 항목</h2>
      <p>오고피씽은(는) 다음의 개인정보 항목을 처리하고 있습니다.</p>
      <p>
        1. 회원 가입 및 관리<br>
        • 필수항목 : 성명, 생년월일, 고유식별번호(UUID)<br><br>
        2. 재화 또는 서비스 제공<br>
        • 필수항목 : 성명, 생년월일, 고유식별번호(UUID)
      </p>
      
      <hr />
      <h2>개인정보의 파기 절차 및 방법</h2>
      <p>
        ① 오고피씽은(는) 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다.<br><br>
        ② 정보주체로부터 동의받은 개인정보 보유기간이 경과하거나 처리목적이 달성되었음에도 불구하고 다른 법령에 따라 개인정보를 계속 보존하여야 하는 경우에는, 해당 개인정보를 별도의 데이터베이스(DB)로 옮기거나 보관장소를 달리하여 보존합니다.<br><br>
        ③ 개인정보 파기의 절차 및 방법은 다음과 같습니다.<br>
        1. 파기절차<br>
        오고피씽은(는) 파기 사유가 발생한 개인정보를 선정하고, 오고피씽의 개인 정보 보호책임자의 승인을 받아 개인정보를 파기합니다.<br>
        2. 파기방법<br>
        오고피씽은(는) 전자적 파일 형태로 기록·저장된 개인정보는 기록을 재생할 수 없도록 파기하며, 종이 문서에 기록·저장된 개인정보는 분쇄기로 분쇄하거나 소각하여 파기합니다.
      </p>
      
      <hr />
      <h2>정보주체와 법정대리인의 권리·의무 및 행사방법</h2>
      <p>
        ① 정보주체는 오고피씽에 대해 언제든지 개인정보 열람·정정·삭제·처리정지 요구 등의 권리를 행사할 수 있습니다.<br><br>
        ② 권리 행사는 오고피씽에 대해 「개인정보 보호법」 시행령 제41조 제1항에 따라 서면, 전자우편, 모사전송(FAX) 등을 통하여 하실 수 있으며, 오고피씽은(는) 이에 대해 지체없이 조치하겠습니다.<br><br>
        ③ 권리 행사는 정보주체의 법정대리인이나 위임을 받은 자 등 대리인을 통하여 하실 수도 있습니다. 이 경우 "개인정보 처리 방법에 관한 고시(제2020-7호)" 별지 제11호 서식에 따른 위임장을 제출하셔야 합니다.<br><br>
        ④ 개인정보 열람 및 처리정지 요구는 「개인정보 보호법」 제35조 제4항, 제37조 제2항에 의하여 정보주체의 권리가 제한 될 수 있습니다.<br><br>
        ⑤ 개인정보의 정정 및 삭제 요구는 다른 법령에서 그 개인정보가 수집 대상으로 명시되어 있는 경우에는 그 삭제를 요구할 수 없습니다.<br><br>
        ⑥ 오고피씽은(는) 정보주체 권리에 따른 열람의 요구, 정정·삭제의 요구, 처리정지의 요구 시 열람 등 요구를 한 자가 본인이거나 정당한 대리인인지를 확인합니다.
      </p>
      
      <hr />
      <h2>개인정보의 안전성 확보조치</h2>
      <p>
        오고피씽은(는) 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.<br><br>
        1. 관리적 조치 : 내부관리계획 수립·시행, 전담조직 운영, 정기적 직원 교육<br>
        2. 기술적 조치 : 개인정보처리시스템 등의 접근권한 관리, 접근통제시스템 설치, 개인정보의 암호화, 보안프로그램 설치 및 갱신<br>
        3. 물리적 조치 : 전산실, 자료보관실 등의 접근통제
      </p>
      
      <hr />
      <h2>개인정보 자동 수집 장치의 설치·운영 및 거부에 관한 사항</h2>
      <p>오고피씽은 정보주체의 이용정보를 저장하고 수시로 불러오는 '쿠키(cookie)'를 사용하지 않습니다.</p>
      
      <hr />
      <h2>행태정보의 수집·이용·제공 및 거부 등에 관한 사항</h2>
      <p>오고피씽은(는) 온라인 맞춤형 광고 등을 위한 행태정보를 수집·이용·제공하지 않습니다.</p>
      
      <hr />
      <h2>개인정보 보호책임자</h2>
      <p>
        ① 오고피씽은(는) 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.<br><br>
        ‣ 개인정보 보호책임자<br>
        성명 : 정영남<br>
        연락처 : yj63486202@gmail.com<br><br>
        ② 정보주체는 오고피씽의 서비스(또는 사업)을 이용하시면서 발생한 모든 개인정보보호 관련 문의, 불만처리, 피해구제 등에 관한 사항을 개인정보 보호책임자에게 문의하실 수 있습니다. 오고피씽은(는) 정보주체의 문의에 대해 지체없이 답변 및 처리해드릴 것입니다.
      </p>
      
      <hr />
      <h2>개인정보 열람청구</h2>
      <p>
        정보주체는 「개인정보 보호법」 제35조에 따른 개인정보의 열람 청구를 아래의 부서에 할 수 있습니다.<br>
        오고피씽은(는) 정보주체의 개인정보 열람청구가 신속하게 처리되도록 노력하겠습니다.<br><br>
        ‣ 개인정보 열람청구 접수·처리 부서<br>
        담당자 : 정영남<br>
        연락처 : yj63486202@gmail.com
      </p>
      
      <hr />
      <h2>권익침해 구제방법</h2>
      <p>
        ① 정보주체는 개인정보침해로 인한 구제를 받기 위하여 개인정보분쟁조정위원회, 한국인터넷진흥원 개인정보침해신고센터 등에 분쟁해결이나 상담 등을 신청할 수 있습니다.<br><br>
        1. 개인정보분쟁조정위원회 : (국번없이) 1833-6972 (www.kopico.go.kr)<br>
        2. 개인정보침해신고센터 : (국번없이) 118 (privacy.kisa.or.kr)<br>
        3. 대검찰청 : (국번없이) 1301 (www.spo.go.kr)<br>
        4. 경찰청 : (국번없이) 182 (ecrm.cyber.go.kr)<br><br>
        ② 오고피씽은(는) 정보주체의 개인정보자기결정권을 보장하고, 개인정보침해로 인한 상담 및 피해 구제를 위해 노력하고 있으며, 신고나 상담이 필요하신 경우 위의 담당부서로 연락해 주시기 바랍니다.<br><br>
        ‣ 개인정보보호 관련 고객 상담 및 신고<br>
        담당자 : 정영남<br>
        연락처 : yj63486202@gmail.com<br><br>
        ③ 「개인정보 보호법」 제35조(개인정보의 열람), 제36조(개인정보의 정정·삭제), 제37조(개인정보의 처리정지 등)의 규정에 의한 요구에 대하여 공공기관의 장이 행한 처분 또는 부작위로 인하여 권리 또는 이익의 침해를 받은 자는 행정심판법이 정하는 바에 따라 행정심판을 청구할 수 있습니다.<br><br>
        ‣ 중앙행정심판위원회 : (국번없이) 110 (www.simpan.go.kr)
      </p>
      
      <hr />
      <h2>개인정보 처리방침의 변경</h2>
      <p>① 이 개인정보 처리방침은 2025. 5. 28부터 적용됩니다.</p>
    </body>
    </html>
  `;

  const handleLogin = async () => {
    if (!name || !dob) {
      alert('입력 오류: 이름과 생년월일을 모두 입력하세요.');
      return;
    }
    
    if (!agreed) {
      alert('동의 필요: 개인정보처리방침에 동의하셔야 합니다.');
      return;
    }
  
    setIsLoading(true);
  
    try {
      console.log('🔍 로그인 시도:', name, dob);

      const user = await loginOrRegisterUser(name, dob);
  
      if ('name' in user && 'dob' in user && 'uuid' in user) {
        console.log('🧾 로그인한 사용자:', user.name, user.uuid);
  
        // ✅ 1. 사용자 정보 저장
        await saveUser({
          name: user.name,
          dob: user.dob,
          uuid: user.uuid,
          isAdmin: user.isAdmin || false
        });
  
        // ✅ 2. 저장 확인
        const storedUser = await import('@/lib/storage').then(m => m.getUser());
        if (storedUser) {
          console.log('✅ 저장 후 localStorage userInfo:', storedUser?.uuid);
        }
  
        // ✅ 3. 신규 회원일 경우 관리자에게 알림
        if (!user.isAdmin && user.isNew) {
          await notifyAllAdmins(
              `${user.name}님이 새로 가입했어요!`,
              '회원 가입 알림',
              'admin-main'
          );
        }
  
        // ✅ 4. 라우팅
        const targetPath = user.isAdmin ? '/admin-main' : '/main';
        router.push(targetPath);
      } else {
        throw new Error('Invalid user data');
      }
    } catch (e) {
      console.error('❗ 로그인 에러:', e);
      alert('로그인 실패: 서버 오류 또는 연결 실패\n(' + e + ')');
      // 로그인 실패 시 localStorage 초기화
      await import('@/lib/storage').then(m => m.clearUser());
      console.log('✅ 로그인 실패로 localStorage 초기화 완료');
      console.log('🔍 로그인 실패:', name, dob);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md">
        {/* 로그인 카드 */}
        <div 
          className="bg-white rounded-2xl shadow-2xl p-8"
          style={{
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* 타이틀 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              오고피씽
            </h1>
          </div>

          {/* 입력 폼 */}
          <div className="space-y-4">
            {/* 이름 입력 */}
            <div className="relative">
              <IoPersonOutline 
                className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" 
                size={20} 
              />
              <input
                type="text"
                placeholder="이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                style={{
                  fontSize: '16px',
                }}
              />
            </div>

            {/* 생년월일 입력 */}
            <div className="relative">
              <IoCalendarOutline 
                className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" 
                size={20} 
              />
              <input
                type="text"
                placeholder="생년월일 (예: 720610)"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                maxLength={6}
                style={{
                  fontSize: '16px',
                }}
              />
            </div>

            {/* 개인정보 동의 */}
            <div className="flex items-center justify-between space-x-3 pt-2">
              <div className="flex items-center space-x-2 flex-1">
                <input
                  type="checkbox"
                  id="agree"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  style={{
                    cursor: 'pointer',
                  }}
                />
                <label htmlFor="agree" className="text-sm text-gray-700 pl-1">
                  개인정보 처리방침에 동의합니다.
                </label>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-purple-600 border border-purple-200 hover:bg-purple-50 transition-all flex items-center gap-1.5 whitespace-nowrap"
              >
                <IoDocumentTextOutline size={16} />
                <span>보기</span>
              </button>
            </div>

            {/* 로그인 버튼 */}
            <button
              onClick={handleLogin}
              disabled={isLoading || !agreed}
              className="w-full py-4 rounded-xl font-semibold text-white text-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                  로그인 중...
                </span>
              ) : (
                '로그인'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 개인정보 처리방침 모달 */}
      {showPrivacyModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowPrivacyModal(false)}
        >
          <div 
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div 
              className="flex justify-between items-center p-6 border-b"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              }}
            >
              <h2 className="text-2xl font-bold text-white">개인정보 처리방침</h2>
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-all"
              >
                <IoCloseOutline size={24} />
              </button>
            </div>
            
            {/* 모달 본문 */}
            <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(85vh - 80px)' }}>
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: privacyHtml }}
                style={{
                  fontSize: '14px',
                  lineHeight: '1.6',
                }}
              />
            </div>
            
            {/* 모달 푸터 */}
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="w-full py-3 rounded-xl font-semibold text-white transition-all"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

