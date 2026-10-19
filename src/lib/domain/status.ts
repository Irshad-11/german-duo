import type { ResourceStatus } from '@/types/db';

export type Tone = 'neutral' | 'info' | 'active' | 'warn' | 'done' | 'help';
export interface StatusMeta { value: ResourceStatus; label: string; hint: string; tone: Tone }

export const STATUSES: StatusMeta[] = [
  { value: 'not_started', label: 'Not started', hint: 'Nothing done yet', tone: 'neutral' },
  { value: 'ready', label: 'Ready to start', hint: 'Link and pages are ready', tone: 'info' },
  { value: 'opened', label: 'Opened', hint: 'Opened the file', tone: 'info' },
  { value: 'reading', label: 'Reading', hint: 'Working on it now', tone: 'active' },
  { value: 'paused', label: 'Paused', hint: 'Stopped for now', tone: 'warn' },
  { value: 'continuing', label: 'Continuing', hint: 'Resuming from the saved page', tone: 'active' },
  { value: 'awaiting_review', label: 'Awaiting review', hint: 'Done, needs a second look', tone: 'info' },
  { value: 'ready_for_questions', label: 'Ready for questions (old)', hint: 'Older status — now a badge on “Finished”', tone: 'info' },
  { value: 'needs_help', label: 'Needs help', hint: 'Stuck — please help', tone: 'help' },
  { value: 'completed', label: 'Completed', hint: 'Finished', tone: 'done' },
];
export const STATUS_BY_VALUE: Record<ResourceStatus, StatusMeta> = Object.fromEntries(STATUSES.map((s) => [s.value, s])) as Record<ResourceStatus, StatusMeta>;
export const statusLabel = (s: ResourceStatus): string => STATUS_BY_VALUE[s].label;

/** Statuses that count as "in motion" on the dashboard. */
export const ACTIVE_STATUSES: ResourceStatus[] = ['opened', 'reading', 'continuing'];
export const ATTENTION_STATUSES: ResourceStatus[] = ['needs_help', 'ready_for_questions', 'awaiting_review'];

/** One-tap actions offered for each status (phone-friendly). `completed` can only be left via a documented correction. */
export function quickActions(status: ResourceStatus): ResourceStatus[] {
  switch (status) {
    case 'not_started': case 'ready': return ['opened', 'reading'];
    case 'opened': return ['reading', 'paused'];
    case 'reading': case 'continuing': return ['paused', 'awaiting_review', 'completed'];
    case 'paused': return ['continuing', 'needs_help'];
    case 'awaiting_review': return ['completed', 'continuing'];
    case 'ready_for_questions': return ['completed', 'continuing'];
    case 'needs_help': return ['continuing', 'completed'];
    case 'completed': return [];
  }
}
export const requiresCorrection = (from: ResourceStatus, to: ResourceStatus): boolean => from === 'completed' && to !== 'completed';

export const PRIORITY_LABEL: Record<1 | 2 | 3, string> = { 1: 'High', 2: 'Normal', 3: 'Low' };

/** The app shows four plain choices; the ten detailed statuses stay available under "more options". */
export type Simple = 'not_started' | 'studying' | 'finished' | 'help';
export const SIMPLE_LABEL: Record<Simple, string> = { not_started: 'Not started', studying: 'Studying', finished: 'Finished', help: 'Need help' };
export function simpleOf(s: ResourceStatus): Simple {
  if (s === 'completed') return 'finished'; if (s === 'needs_help') return 'help'; if (s === 'not_started' || s === 'ready') return 'not_started'; return 'studying';
}
export function statusFromSimple(target: Simple, current: ResourceStatus): ResourceStatus {
  if (simpleOf(current) === target) return current;
  return target === 'finished' ? 'completed' : target === 'help' ? 'needs_help' : target === 'studying' ? 'reading' : 'not_started';
}
