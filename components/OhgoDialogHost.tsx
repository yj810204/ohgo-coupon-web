'use client';

import { useEffect, useState } from 'react';
import OhgoModal, { OhgoModalButton } from '@/components/OhgoModal';
import {
  installOhgoDialogGlobals,
  resolveOhgoDialog,
  subscribeOhgoDialog,
  type OhgoDialogRequest,
} from '@/lib/ohgo-dialog';

/**
 * window.alert → OhgoModal, confirm 은 ohgoConfirm() 사용.
 * WebView 기본 alert 제목(도메인)을 제거한다.
 */
export default function OhgoDialogHost() {
  const [req, setReq] = useState<OhgoDialogRequest | null>(null);

  useEffect(() => {
    installOhgoDialogGlobals();
    return subscribeOhgoDialog(setReq);
  }, []);

  if (!req) return null;

  const closeAlert = () => resolveOhgoDialog(req.id, true);
  const confirmOk = () => resolveOhgoDialog(req.id, true);
  const confirmCancel = () => resolveOhgoDialog(req.id, false);
  const body = (
    <p className="ohgo-modal__text ohgo-modal__text--start mb-0" style={{ whiteSpace: 'pre-line' }}>
      {req.message}
    </p>
  );

  if (req.kind === 'alert') {
    return (
      <OhgoModal
        open
        onClose={closeAlert}
        title={req.title}
        titleTone="brand"
        closeOnBackdrop={false}
        footer={<OhgoModalButton onClick={closeAlert}>확인</OhgoModalButton>}
      >
        {body}
      </OhgoModal>
    );
  }

  return (
    <OhgoModal
      open
      onClose={confirmCancel}
      title={req.title}
      titleTone="brand"
      closeOnBackdrop={false}
      footer={
        <>
          <OhgoModalButton variant="secondary" onClick={confirmCancel}>
            취소
          </OhgoModalButton>
          <OhgoModalButton onClick={confirmOk}>확인</OhgoModalButton>
        </>
      }
    >
      {body}
    </OhgoModal>
  );
}
