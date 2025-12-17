'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  disabled?: boolean;
}

interface UsePullToRefreshReturn {
  isPulling: boolean;
  pullProgress: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const isRefreshingRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current) return;
    
    const container = containerRef.current;
    if (!container) return;

    // 스크롤이 맨 위에 있을 때만 작동
    if (container.scrollTop > 0) return;

    startYRef.current = e.touches[0].clientY;
    currentYRef.current = startYRef.current;
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current) return;
    if (startYRef.current === 0) return;

    const container = containerRef.current;
    if (!container) return;

    // 스크롤이 맨 위에 있을 때만 작동
    if (container.scrollTop > 0) {
      startYRef.current = 0;
      setIsPulling(false);
      setPullProgress(0);
      return;
    }

    currentYRef.current = e.touches[0].clientY;
    const deltaY = currentYRef.current - startYRef.current;

    // 아래로 당길 때만 작동
    if (deltaY > 0) {
      e.preventDefault();
      setIsPulling(true);
      const progress = Math.min(deltaY / threshold, 1);
      setPullProgress(progress);
    }
  }, [disabled, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshingRef.current) return;
    if (startYRef.current === 0) return;

    const deltaY = currentYRef.current - startYRef.current;

    if (deltaY >= threshold && isPulling) {
      isRefreshingRef.current = true;
      setIsPulling(true);
      setPullProgress(1);

      try {
        await onRefresh();
      } catch (error) {
        console.error('Pull to refresh error:', error);
      } finally {
        setTimeout(() => {
          setIsPulling(false);
          setPullProgress(0);
          isRefreshingRef.current = false;
        }, 300);
      }
    } else {
      setIsPulling(false);
      setPullProgress(0);
    }

    startYRef.current = 0;
    currentYRef.current = 0;
  }, [disabled, threshold, isPulling, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, disabled]);

  return {
    isPulling,
    pullProgress,
    containerRef,
  };
}

