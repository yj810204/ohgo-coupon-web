'use client';

import { useEffect, useRef } from 'react';
import OhgoModal from '@/components/OhgoModal';

type PostcodeResult = {
  address: string;
  addressType: string;
  bname: string;
  buildingName: string;
};

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: PostcodeResult) => void;
        onclose?: (state: string) => void;
        width?: string | number;
        height?: string | number;
      }) => {
        open: () => void;
        /** WebView에서는 팝업(open)이 흰 화면만 뜨므로 embed 사용 */
        embed: (element: HTMLElement) => void;
      };
    };
  }
}

const SCRIPT_ID = 'daum-postcode-script';

/** 다음 우편번호 스크립트를 미리 불러둔다. 검색 버튼이 있는 화면에서 마운트할 때 부른다. */
export function usePostcodeScript() {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);
  }, []);
}

function formatAddress(data: PostcodeResult): string {
  let full = data.address;
  if (data.addressType === 'R') {
    if (data.bname) full += ` (${data.bname}`;
    if (data.buildingName) {
      full += data.bname ? `, ${data.buildingName})` : ` (${data.buildingName})`;
    } else if (data.bname) {
      full += ')';
    }
  }
  return full;
}

export default function PostcodeSearchModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (address: string) => void;
}) {
  const embedRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onCloseRef.current = onClose;
  }, [onSelect, onClose]);

  // WebView는 window.open 팝업이 막히거나 흰 화면만 뜸 → 모달 안에 embed
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tryEmbed = () => {
      if (cancelled) return;
      if (!embedRef.current || !window.daum?.Postcode) {
        window.setTimeout(tryEmbed, 120);
        return;
      }
      embedRef.current.innerHTML = '';
      new window.daum.Postcode({
        oncomplete: (data) => onSelectRef.current(formatAddress(data)),
        onclose: () => onCloseRef.current(),
        width: '100%',
        height: '100%',
      }).embed(embedRef.current);
    };
    tryEmbed();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <OhgoModal
      open={open}
      onClose={onClose}
      title="주소 검색"
      size="lg"
      scrollable={false}
      closeOnBackdrop
      bodyPadding={false}
    >
      <div
        ref={embedRef}
        style={{ width: '100%', height: 'min(70vh, 520px)', minHeight: 360, overflow: 'hidden' }}
      />
    </OhgoModal>
  );
}
