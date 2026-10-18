import { z } from 'zod';

export const accessKeySchema = z.string().trim().min(6, 'Enter your access key').max(128, 'That key is too long');

export const newKeySchema = z.object({
  current: accessKeySchema,
  next: z.string().min(8, 'Use at least 8 characters').max(128, 'Use at most 128 characters'),
  confirm: z.string(),
}).refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'The new keys do not match' })
  .refine((v) => v.next !== v.current, { path: ['next'], message: 'Choose a key different from the current one' });

export const WORD_TYPES = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'numeral', 'phrase', 'other'] as const;
export const wordSchema = z.object({
  german: z.string().trim().min(1, 'Enter the German word or phrase').max(200),
  word_type: z.enum(WORD_TYPES),
  article: z.enum(['', 'der', 'die', 'das']),
  plural: z.string().trim().max(200),
  meaning_en: z.string().trim().max(400),
  meaning_bn: z.string().trim().max(400),
  pronunciation: z.string().trim().max(200),
  pronunciation_verified: z.boolean(),
  translation_verified: z.boolean(),
  example_de: z.string().trim().max(500),
  example_en: z.string().trim().max(500),
  example_bn: z.string().trim().max(500),
  tags: z.string().max(300),
  level: z.enum(['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  source: z.string().trim().max(200),
  details: z.record(z.string(), z.string()),
  private_note: z.string().max(2000),
}).refine((v) => v.meaning_en.length > 0 || v.meaning_bn.length > 0, { path: ['meaning_en'], message: 'Add an English or Bangla meaning' })
  .refine((v) => v.word_type === 'noun' || (v.article === '' && v.plural === ''), { path: ['article'], message: 'Only nouns have an article and plural' });

export const postponeSchema = z.object({ deadline: z.string().min(1, 'Choose a new deadline'), reason: z.string().trim().min(3, 'Give a short reason (at least 3 characters)').max(500) });

export const announcementSchema = z.object({
  title: z.string().trim().min(1, 'Add a title').max(140),
  body: z.string().trim().min(1, 'Write the notice').max(4000),
  priority: z.enum(['normal', 'important']),
  expires: z.string(),
});

export const noteSchema = z.object({ body: z.string().trim().min(1, 'Write something first').max(20000), title: z.string().trim().max(200) });

export const goalSchema = z.object({
  title: z.string().trim().min(1, 'Give the goal a title').max(160),
  deadline: z.string().min(1, 'Choose a deadline'),
  week_start: z.string().min(1),
}).refine((v) => v.deadline >= v.week_start, { path: ['deadline'], message: 'The deadline cannot be before the week starts' });

export interface PageRangeInput { start: string; end: string; pageCount: number | null }
/** Returns an error message or null. Empty start+end means "no range" which is allowed. */
export function validatePageRange({ start, end, pageCount }: PageRangeInput): string | null {
  if (!start.trim() && !end.trim()) return null;
  if (!start.trim() || !end.trim()) return 'Enter both the first and the last page.';
  const s = Number(start); const e = Number(end);
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1) return 'Pages must be whole numbers from 1.';
  if (e < s) return 'The last page must not be before the first page.';
  if (pageCount != null && e > pageCount) return `This file has only ${pageCount} pages.`;
  return null;
}

export const sessionSchema = z.object({ minutes: z.number().int().min(1, 'At least 1 minute').max(720, 'At most 12 hours per session') });
