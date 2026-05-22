'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { markNotificationRead } from './actions';

export function NotificationLink({
  id,
  href,
  className,
  unread,
  children,
}: {
  id: string;
  href: string;
  className: string;
  unread: boolean;
  children: React.ReactNode;
}) {
  const [, startTransition] = useTransition();

  function handleClick() {
    if (!unread) return;
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
