import type { Rating } from '@/types/db';

/**
 * Review scheduling: an SM-2–style expanding-interval scheduler (spacing effect), simplified for language vocabulary.
 *  - again: relearn within 10 minutes, lapse counted, ease reduced
 *  - hard : small growth, ease reduced
 *  - good : 1 day → 3 days → interval × ease
 *  - easy : 3 days → 7 days → interval × ease × 1.3, ease raised
 */
export interface SrsState { ease: number; interval_days: number; repetitions: number; lapses: number }
export interface SrsResult extends SrsState { due_at: Date }

const MIN_EASE = 1.3; const MAX_EASE = 3.5;
const clampEase = (e: number) => Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, e)) * 100) / 100;

export const INITIAL_SRS: SrsState = { ease: 2.5, interval_days: 0, repetitions: 0, lapses: 0 };

export function schedule(state: SrsState, rating: Rating, now: Date = new Date()): SrsResult {
  let { ease, interval_days: interval, repetitions: reps } = state;
  const { lapses } = state;
  if (rating === 'again') {
    return { ease: clampEase(ease - 0.2), interval_days: 0, repetitions: 0, lapses: lapses + 1, due_at: new Date(now.getTime() + 10 * 60 * 1000) };
  }
  if (rating === 'hard') {
    interval = reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
    ease = clampEase(ease - 0.15);
  } else if (rating === 'good') {
    interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(interval + 1, Math.round(interval * ease));
  } else {
    interval = reps === 0 ? 3 : reps === 1 ? 7 : Math.max(interval + 2, Math.round(interval * ease * 1.3));
    ease = clampEase(ease + 0.15);
  }
  reps += 1;
  return { ease, interval_days: interval, repetitions: reps, lapses, due_at: new Date(now.getTime() + interval * 86400000) };
}

export const isDue = (dueAt: string | Date, now: Date = new Date()): boolean => new Date(dueAt).getTime() <= now.getTime();

export const RATING_LABEL: Record<Rating, string> = { again: 'Review again', hard: 'Needed help', good: 'Remembered', easy: 'Easy' };
export function previewInterval(state: SrsState, rating: Rating, now = new Date()): string {
  const r = schedule(state, rating, now);
  if (rating === 'again') return '10 min';
  return r.interval_days === 1 ? '1 day' : `${r.interval_days} days`;
}
