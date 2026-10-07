// Time-of-day greeting and the date line shown at the top of Home.
// Written by hand instead of with toLocaleDateString so the output is identical on every phone.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function greetingFor(hour: number, name?: string | null): string {
  const base = hour < 5 ? 'Late session' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = firstName(name);
  return first ? `${base}, ${first}` : base;
}

// The first word of a display name, kept short so the greeting fits on one line.
export function firstName(name?: string | null): string {
  const first = name?.trim().split(/\s+/)[0] ?? '';
  return first.length > 12 ? first.slice(0, 12) : first;
}

export function formatHomeDate(date: Date): string {
  return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
