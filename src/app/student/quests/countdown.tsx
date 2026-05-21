'use client';

import { useEffect, useState } from 'react';
import { formatLongCountdown } from '@/app/teacher/quests/indicator';

export function LiveCountdown({
  targetIso,
  label,
}: {
  targetIso: string;
  label?: string;
}) {
  const targetMs = new Date(targetIso).getTime();
  const [text, setText] = useState(() => formatLongCountdown(targetMs));

  useEffect(() => {
    function tick() {
      setText(formatLongCountdown(targetMs));
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [targetMs]);

  if (text === 'now') {
    return <span>{label ? `${label} pending` : 'pending'}</span>;
  }
  return (
    <span>
      {label ? `${label} in ${text}` : `in ${text}`}
    </span>
  );
}
