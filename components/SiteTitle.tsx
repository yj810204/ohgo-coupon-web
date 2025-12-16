'use client';

import { useEffect } from 'react';
import { getSiteName } from '@/utils/site-settings-service';

export default function SiteTitle() {
  useEffect(() => {
    const updateTitle = async () => {
      try {
        const siteName = await getSiteName();
        document.title = siteName;
      } catch (error) {
        console.error('Error loading site name:', error);
        document.title = '오고피씽';
      }
    };
    updateTitle();
  }, []);

  return null;
}

