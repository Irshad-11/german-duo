import type { Level } from '@/types/db';

export const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const LEVEL_VAR: Record<Level, string> = {
  A1: 'var(--lvl-a1)', A2: 'var(--lvl-a2)', B1: 'var(--lvl-b1)', B2: 'var(--lvl-b2)', C1: 'var(--lvl-c1)', C2: 'var(--lvl-c2)', ALL: 'var(--lvl-all)',
};
export const folderColor = (level: Level | null | undefined): string => LEVEL_VAR[level ?? 'ALL'];
export const folderCrumbs = (sourceFolder: string | null | undefined): string[] => (sourceFolder ?? '').split('/').filter(Boolean);

const CATEGORY_LABEL: Record<string, string> = {
  'grammar-lesson': 'Grammar lesson', story: 'Story', coursebook: 'Coursebook', vocabulary: 'Vocabulary', exam: 'Exam prep',
  'answer-key': 'Answer key', reading: 'Reading', 'grammar-reference': 'Grammar reference', career: 'Career info', writing: 'Writing', speaking: 'Speaking',
};
export const categoryLabel = (c: string | null | undefined): string => (c ? CATEGORY_LABEL[c] ?? c : 'Resource');
export const CATEGORIES = Object.keys(CATEGORY_LABEL);

export function formatSize(kb: number | null | undefined): string {
  if (kb == null) return '';
  return kb >= 1024 ? `${(kb / 1024).toFixed(kb >= 10240 ? 0 : 1)} MB` : `${Math.round(kb)} KB`;
}
export const pageRangeLabel = (start: number | null, end: number | null, total: number | null): string => {
  if (start == null || end == null) return total ? `${total} pages · range not chosen` : 'whole file';
  const range = start === end ? `p. ${start}` : `pp. ${start}–${end}`;
  return total ? `${range} of ${total}` : range;
};
