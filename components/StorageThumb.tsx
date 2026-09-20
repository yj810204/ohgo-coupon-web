'use client';

import { useEffect, useState } from 'react';
import { supabaseListImageUrl, supabaseOriginalImageUrl } from '@/lib/supabase-image';

type StorageThumbProps = {
  url?: string;
  alt?: string;
  size?: number;
  radius?: number;
};

export default function StorageThumb({ url, alt = '', size = 64, radius = 12 }: StorageThumbProps) {
  const original = supabaseOriginalImageUrl(url) || url;
  const thumb = supabaseListImageUrl(original, size * 2);
  const [src, setSrc] = useState(thumb || original);

  useEffect(() => {
    setSrc(thumb || original);
  }, [thumb, original]);

  return (
    <div
      className="flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#F2F3F5' }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => {
            if (original && src !== original) setSrc(original);
          }}
        />
      ) : null}
    </div>
  );
}
