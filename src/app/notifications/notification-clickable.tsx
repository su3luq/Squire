'use client';

import { useTransition } from 'react';
import { markNotificationRead } from './actions';

export function NotificationClickable({
  id,
  className,
  unread,
  children,
}: {
  id: string;
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
    <button
      type="button"
      onClick={handleClick}
      className={`${className} w-full text-left`}
    >
      {children}
    </button>
  );
}
