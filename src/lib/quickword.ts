export type Article = 'der' | 'die' | 'das';
/** "die Reise" → { article: 'die', german: 'Reise' }; anything else is kept as typed. */
export function parseQuickWord(input: string): { german: string; article: Article | null } {
  const t = input.trim().replace(/\s+/g, ' ');
  const m = /^(der|die|das)\s+(.+)$/i.exec(t);
  return m ? { article: m[1].toLowerCase() as Article, german: m[2] } : { article: null, german: t };
}
const BN = /[\u0980-\u09FF]/;
/** One "meaning" box accepts English or Bangla; Bangla script goes to the Bangla field automatically. */
export function splitMeaning(text: string): { en: string | null; bn: string | null } {
  const t = text.trim(); if (!t) return { en: null, bn: null };
  return BN.test(t) ? { en: null, bn: t } : { en: t, bn: null };
}
export const normalizeGerman = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();
