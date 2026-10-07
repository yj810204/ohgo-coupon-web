'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { useLoading } from '@/contexts/LoadingContext';
import { armClientNavigation } from '@/lib/navigation-guard';

type AppLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  prefetch?: boolean;
  ariaLabel?: string;
  ariaCurrent?: 'page' | undefined;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/** 프리페치가 되는 내부 링크. 실제 이동이 150ms를 넘기면 상단 로더가 나온다. */
export default function AppLink({
  href,
  children,
  className,
  style,
  prefetch = true,
  ariaLabel,
  ariaCurrent,
  onClick,
}: AppLinkProps) {
  const pathname = usePathname();
  const { setLoading } = useLoading();

  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={className}
      style={style}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        const armed = armClientNavigation(pathname, href);
        if (armed.targetPath) setLoading(true);
      }}
    >
      {children}
    </Link>
  );
}

type NavSurfaceProps = {
  href?: string;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  ariaLabel?: string;
};

/** 주소가 있으면 Link, 없으면 기존 버튼 동작을 유지한다. */
export function NavSurface({ href, onClick, className, style, children, ariaLabel }: NavSurfaceProps) {
  if (href) {
    return (
      <AppLink
        href={href}
        className={className}
        ariaLabel={ariaLabel}
        style={{ textDecoration: 'none', color: 'inherit', ...style }}
      >
        {children}
      </AppLink>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
