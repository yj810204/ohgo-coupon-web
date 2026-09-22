'use client';

import OhgoModal, { OhgoModalButton, OhgoModalCancelLink } from '@/components/OhgoModal';
import { supabaseOriginalImageUrl } from '@/lib/supabase-image';
import type { AppPopupSettings } from '@/utils/site-settings-service';

export default function AppPopupSheet({
  open,
  popup,
  onClose,
  onDismissForever,
  onCta,
}: {
  open: boolean;
  popup: AppPopupSettings;
  onClose: () => void;
  onDismissForever: () => void;
  onCta?: () => void;
}) {
  const imageUrlRaw = popup?.imageUrl ?? '';
  const imageUrl = supabaseOriginalImageUrl(imageUrlRaw) || imageUrlRaw.trim();
  const title = (popup?.title ?? '').trim() || '알림';
  const body = (popup?.body ?? '').trim();
  const ctaLabel = (popup?.ctaLabel ?? '').trim();
  const hasCta = Boolean(ctaLabel && onCta);

  return (
    <OhgoModal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          {hasCta ? (
            <OhgoModalButton variant="primary" onClick={onCta}>
              {ctaLabel}
            </OhgoModalButton>
          ) : (
            <OhgoModalButton variant="primary" onClick={onClose}>
              확인
            </OhgoModalButton>
          )}
          <OhgoModalCancelLink onClick={onDismissForever}>다시 보지 않기</OhgoModalCancelLink>
        </>
      }
    >
      {imageUrl ? (
        <div
          className="overflow-hidden mb-3"
          style={{ borderRadius: 16, backgroundColor: '#F2F3F5' }}
        >
          <img
            src={imageUrl}
            alt=""
            style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
          />
        </div>
      ) : null}
      {body ? (
        <p
          className="mb-0"
          style={{
            fontSize: 15,
            fontWeight: 500,
            lineHeight: 1.55,
            color: '#1A1D1F',
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-ohgo), sans-serif',
          }}
        >
          {body}
        </p>
      ) : null}
    </OhgoModal>
  );
}
