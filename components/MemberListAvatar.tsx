'use client';

import { useState } from 'react';
import { IoPersonOutline } from 'react-icons/io5';

type MemberListAvatarProps = {
  imageUrl?: string | null;
  name?: string;
  size?: number;
  /** 파란 배너 등 어두운 배경 위 */
  tone?: 'default' | 'light';
};

export default function MemberListAvatar({
  imageUrl,
  name,
  size = 44,
  tone = 'default',
}: MemberListAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = !!imageUrl && !failed;
  const onLight = tone === 'light';

  return (
    <div
      className="rounded-circle flex-shrink-0 overflow-hidden d-flex align-items-center justify-content-center"
      style={{
        width: size,
        height: size,
        backgroundColor: onLight ? 'rgba(255,255,255,0.22)' : '#F2F3F5',
        border: onLight ? '2px solid rgba(255,255,255,0.35)' : '1px solid #EFEFEF',
      }}
      aria-hidden={!name}
      title={name}
    >
      {showImage ? (
        <img
          src={imageUrl!}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <IoPersonOutline
          size={Math.round(size * 0.46)}
          color={onLight ? 'rgba(255,255,255,0.9)' : '#9CA3AF'}
          aria-hidden
        />
      )}
    </div>
  );
}
