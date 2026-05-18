// Saigon-local date helpers. Per CLAUDE.md Hard Rule #7: all times are
// Asia/Ho_Chi_Minh for display purposes.

const SAIGON_TZ = 'Asia/Ho_Chi_Minh';

// "May 19" — short month + numeric day, Saigon-local.
export function saigonShortDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: SAIGON_TZ,
  }).format(d);
}
