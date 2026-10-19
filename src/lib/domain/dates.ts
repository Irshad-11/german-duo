const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (never shifted by timezone). */
export const toISO = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s: string): Date => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number): Date => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
/** Monday-based week start. */
export const startOfWeek = (d: Date): Date => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const weekStartISO = (d: Date): string => toISO(startOfWeek(d));
export const diffDays = (a: Date, b: Date): number => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);

/** 1-based week number inside a plan (can be <1 before the plan starts). */
export const planWeekNumber = (planStartISO: string, date: Date): number =>
  Math.floor(diffDays(startOfWeek(parseISO(planStartISO)), startOfWeek(date)) / 7) + 1;
export const weekStartForPlanWeek = (planStartISO: string, week: number): string =>
  toISO(addDays(startOfWeek(parseISO(planStartISO)), (week - 1) * 7));
export const totalPlanWeeks = (startISO: string, endISO: string): number =>
  Math.max(1, Math.ceil((diffDays(parseISO(startISO), parseISO(endISO)) + 1) / 7));

export const isOverdue = (deadlineISO: string, today: Date = new Date()): boolean => diffDays(parseISO(deadlineISO), today) > 0;
export const daysUntil = (iso: string, today: Date = new Date()): number => diffDays(today, parseISO(iso));

const fmtShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
export const formatDay = (iso: string): string => fmtShort.format(parseISO(iso));
export const formatDayLong = (iso: string): string => fmtLong.format(parseISO(iso));
export const formatTime = (ts: string | Date): string => fmtTime.format(typeof ts === 'string' ? new Date(ts) : ts);
export const weekLabel = (weekStart: string): string => `${formatDay(weekStart)} – ${formatDay(toISO(addDays(parseISO(weekStart), 6)))}`;

export function timeAgo(ts: string, now: Date = new Date()): string {
  const s = Math.round((now.getTime() - new Date(ts).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); if (d < 7) return `${d} d ago`;
  return fmtShort.format(new Date(ts));
}
export function formatMinutes(min: number): string {
  if (!min || min < 1) return '0 min';
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** Compact form for tight spaces: 0m · 45m · 2h · 2h 05m. */
export function formatMinutesShort(min: number): string {
  if (!min || min < 1) return '0m'; const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return h ? (m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`) : `${m}m`;
}
