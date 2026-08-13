'use client';

import type { ReactNode } from 'react';
import {
  IoAlertCircleOutline,
  IoCalendarOutline,
  IoCallOutline,
  IoLocationOutline,
  IoPersonOutline,
} from 'react-icons/io5';
import OhgoModal, {
  OhgoModalInfoList,
  OhgoModalInfoRow,
  OhgoModalText,
} from '@/components/OhgoModal';

export type BoardingInfoView = {
  name: string;
  birth?: string | null;
  gender?: string | null;
  phone?: string | null;
  emergency?: string | null;
  address?: string | null;
};

function displayOrEmpty(value?: string | null): string {
  const v = (value ?? '').trim();
  return v || '미입력';
}

function formatBirth(value?: string | null): string {
  const raw = (value ?? '').replace(/\D/g, '');
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
  }
  if (raw.length === 6) {
    return `${raw.slice(0, 2)}.${raw.slice(2, 4)}.${raw.slice(4, 6)}`;
  }
  return displayOrEmpty(value);
}

type BoardingInfoModalProps = {
  open: boolean;
  onClose: () => void;
  /** 제목용 이름 (보통 회원/명부 표시명) */
  personName: string;
  data: BoardingInfoView | null;
  footer?: ReactNode;
  /** 명부 없음 상태 */
  empty?: boolean;
  emptyMessage?: string;
  emptyTitle?: string;
  titleTone?: 'default' | 'danger' | 'brand';
};

/** 회원상세·승선명부 공통 — «OOO님의 명부 정보» 시트 */
export default function BoardingInfoModal({
  open,
  onClose,
  personName,
  data,
  footer,
  empty = false,
  emptyMessage,
  emptyTitle,
  titleTone = 'brand',
}: BoardingInfoModalProps) {
  const title = empty
    ? emptyTitle || '명부 정보 없음'
    : `${personName}님의 명부 정보`;

  return (
    <OhgoModal
      open={open}
      onClose={onClose}
      title={title}
      titleTone={empty ? 'danger' : titleTone}
      footer={footer}
      footerLayout="row"
      closeOnBackdrop
    >
      {empty ? (
        <OhgoModalText>
          {emptyMessage || `${personName}님의 명부 정보가 없습니다.`}
        </OhgoModalText>
      ) : data ? (
        <OhgoModalInfoList>
          <OhgoModalInfoRow
            icon={IoPersonOutline}
            label="이름"
            value={
              <>
                {displayOrEmpty(data.name)}
                {data.gender?.trim() ? ` (${data.gender.trim()})` : ''}
              </>
            }
          />
          <OhgoModalInfoRow
            icon={IoCalendarOutline}
            label="생년월일"
            value={formatBirth(data.birth)}
          />
          <OhgoModalInfoRow
            icon={IoCallOutline}
            label="연락처"
            value={displayOrEmpty(data.phone)}
          />
          <OhgoModalInfoRow
            icon={IoAlertCircleOutline}
            label="비상 연락처"
            value={displayOrEmpty(data.emergency)}
          />
          <OhgoModalInfoRow
            icon={IoLocationOutline}
            label="주소"
            value={displayOrEmpty(data.address)}
          />
        </OhgoModalInfoList>
      ) : null}
    </OhgoModal>
  );
}
