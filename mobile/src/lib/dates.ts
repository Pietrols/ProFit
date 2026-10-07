// Calendar days as the phone's user sees them. A day is stored as YYYY-MM-DD in the phone's own
// time zone, because "today" means the user's today, not the server's.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Parses YYYY-MM-DD as a local calendar day (midnight in the phone's time zone).
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(day: string, days: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + days);
  return localDay(date);
}

// "Today", "Yesterday", or a short date like "Mon 5 Oct". The year is added when it is not this year.
export function formatDay(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  const date = parseDay(day);
  const base = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return day.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${date.getFullYear()}`;
}
