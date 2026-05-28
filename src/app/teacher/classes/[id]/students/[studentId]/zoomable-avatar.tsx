'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@/components/avatar';

interface Props {
  url: string | null;
  name: string;
}

export function ZoomableAvatar({ url, name }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!url) {
    return <Avatar url={null} name={name} size="lg" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`View ${name}'s photo`}
      >
        <Avatar url={url} name={name} size="lg" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${name}'s photo`}
        >
          <div
            className="flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={name}
              className="rounded-md object-contain shadow-2xl"
              style={{
                width: 'min(80vmin, 384px)',
                height: 'min(80vmin, 384px)',
              }}
            />
            <p className="text-sm text-white/90">{name}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-1 rounded-md bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
