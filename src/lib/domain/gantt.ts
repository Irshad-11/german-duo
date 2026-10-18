import { addDays, parseISO, startOfWeek, toISO } from './dates';
import { daysBetweenISO } from './stats';

export type GanttScale = 'weeks' | 'days';
export const DAY_PX: Record<GanttScale, number> = { weeks: 9, days: 28 };

export interface GanttRange { start: string; end: string; days: number }
/** Timeline is limited to the plan (plus whatever the goals need) — never an endless scroll. Padded to whole weeks. */
export function ganttRange(planStart: string | null, planEnd: string | null, goals: Array<{ start_date: string; deadline: string }>): GanttRange {
  const starts = [planStart, ...goals.map((g) => g.start_date)].filter(Boolean) as string[];
  const ends = [planEnd, ...goals.map((g) => g.deadline)].filter(Boolean) as string[];
  const today = toISO(new Date());
  const s = (starts.length ? starts.sort()[0] : today); const e = (ends.length ? ends.sort().at(-1)! : toISO(addDays(new Date(), 90)));
  const start = toISO(startOfWeek(parseISO(s))); const endMon = startOfWeek(parseISO(e));
  const end = toISO(addDays(endMon, 6));
  return { start, end, days: daysBetweenISO(start, end) + 1 };
}
export interface Bar { left: number; width: number; origRight: number | null }
/** Pixel box for a goal (inclusive of both dates). origRight = extra width showing the postponed stretch. */
export function barBox(g: { start_date: string; deadline: string; original_deadline: string }, range: GanttRange, dayPx: number): Bar {
  const left = daysBetweenISO(range.start, g.start_date) * dayPx;
  const width = (daysBetweenISO(g.start_date, g.deadline) + 1) * dayPx;
  const postponedDays = daysBetweenISO(g.original_deadline, g.deadline);
  return { left, width: Math.max(dayPx, width), origRight: postponedDays > 0 ? postponedDays * dayPx : null };
}
export const todayOffset = (range: GanttRange, dayPx: number, today = toISO(new Date())): number | null => {
  const d = daysBetweenISO(range.start, today); return d < 0 || d >= range.days ? null : d * dayPx + dayPx / 2;
};
export function weekTicks(range: GanttRange): Array<{ date: string; offsetDays: number; n: number }> {
  const out: Array<{ date: string; offsetDays: number; n: number }> = [];
  for (let i = 0; i * 7 < range.days; i++) out.push({ date: toISO(addDays(parseISO(range.start), i * 7)), offsetDays: i * 7, n: i + 1 });
  return out;
}
export function monthSpans(range: GanttRange): Array<{ label: string; offsetDays: number; days: number }> {
  const out: Array<{ label: string; offsetDays: number; days: number }> = []; const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
  for (let i = 0; i < range.days; i++) {
    const d = addDays(parseISO(range.start), i); const label = fmt.format(d);
    const last = out[out.length - 1];
    if (last && last.label === label) last.days++; else out.push({ label, offsetDays: i, days: 1 });
  }
  return out;
}
