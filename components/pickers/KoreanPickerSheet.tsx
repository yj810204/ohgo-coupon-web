'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { OHGO_FONT } from '@/lib/page-styles';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function KoreanPickerSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const current = document.activeElement;
      const index = items.indexOf(current as HTMLElement);
      if (event.shiftKey && (index <= 0)) {
        event.preventDefault();
        items[items.length - 1]?.focus();
      } else if (!event.shiftKey && (index === -1 || index >= items.length - 1)) {
        event.preventDefault();
        items[0]?.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 21000,
        background: 'rgba(26, 29, 31, 0.45)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          border: 'none',
          background: 'transparent',
          padding: 0,
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#FFFFFF',
          borderRadius: '16px 16px 0 0',
          padding: '12px 16px 20px',
          fontFamily: OHGO_FONT,
          boxShadow: '0 -8px 24px rgba(0,0,0,0.12)',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 36,
            height: 4,
            borderRadius: 999,
            background: '#E6E8EC',
            margin: '0 auto 12px',
          }}
        />
        <div id={titleId} style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', marginBottom: 12 }}>
          {title}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
