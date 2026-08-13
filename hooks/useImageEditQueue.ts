'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type PendingEditImage = {
  id: string;
  file: File;
  previewUrl: string;
};

/**
 * 파일 선택 → 편집 큐 → ImageEditor 순차 처리.
 * 적용된 파일만 onComplete로 전달한다.
 */
export function useImageEditQueue(onComplete: (files: File[]) => void) {
  const [current, setCurrent] = useState<PendingEditImage | null>(null);
  const [remaining, setRemaining] = useState(0);
  const queueRef = useRef<PendingEditImage[]>([]);
  const completedRef = useRef<File[]>([]);
  const revokeRef = useRef<string[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearRevoked = useCallback(() => {
    revokeRef.current.forEach((url) => URL.revokeObjectURL(url));
    revokeRef.current = [];
  }, []);

  useEffect(() => () => clearRevoked(), [clearRevoked]);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    setRemaining(queueRef.current.length);
    setCurrent(next);
    if (!next) {
      const done = completedRef.current;
      completedRef.current = [];
      if (done.length > 0) onCompleteRef.current(done);
    }
  }, []);

  const startWithFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      clearRevoked();
      completedRef.current = [];
      const pending = files.map((file, index) => {
        const previewUrl = URL.createObjectURL(file);
        revokeRef.current.push(previewUrl);
        return {
          id: `${file.name}-${file.size}-${index}-${Date.now()}`,
          file,
          previewUrl,
        };
      });
      queueRef.current = pending;
      showNext();
    },
    [clearRevoked, showNext]
  );

  const acceptCurrent = useCallback(
    (editedFile: File) => {
      completedRef.current.push(editedFile);
      showNext();
    },
    [showNext]
  );

  const skipCurrent = useCallback(() => {
    showNext();
  }, [showNext]);

  const cancelAll = useCallback(() => {
    completedRef.current = [];
    queueRef.current = [];
    setRemaining(0);
    setCurrent(null);
  }, []);

  return {
    current,
    remaining,
    startWithFiles,
    acceptCurrent,
    skipCurrent,
    cancelAll,
    isEditing: current !== null,
  };
}
