import type { ChangeEntry, TabName } from '@/types/db';
import { STATUS_BY_VALUE } from './status';

export const TABLE_TAB: Record<string, TabName> = {
  goals: 'plan', goal_resources: 'plan', goal_progress: 'plan', study_sessions: 'plan', plans: 'plan', postponement_requests: 'plan',
  resources: 'library', curriculum_items: 'library', vocab_words: 'words', notes: 'notes', announcements: 'notices',
};
export const TABLE_NOUN: Record<string, string> = {
  goals: 'goal', goal_resources: 'file in a goal', goal_progress: 'progress', study_sessions: 'study time', plans: 'plan', postponement_requests: 'postponement', resources: 'library file',
  curriculum_items: 'curriculum step', vocab_words: 'word', notes: 'note', announcements: 'notice',
};
export const AREAS: Array<{ value: TabName | 'all'; label: string }> = [
  { value: 'all', label: 'Everything' }, { value: 'plan', label: 'Plan & progress' }, { value: 'words', label: 'Words' }, { value: 'notes', label: 'Notes' }, { value: 'library', label: 'Library' }, { value: 'notices', label: 'Notices' },
];
const FIELD: Record<string, string> = {
  title: 'title', description: 'description', start_date: 'start', deadline: 'deadline', priority: 'priority', est_minutes: 'est. minutes', status: 'status', current_page: 'page',
  pages_done: 'pages done', measure_done: 'amount done', measure_target: 'target', measure_unit: 'unit', note: 'note', start_page: 'first page', end_page: 'last page',
  external_url: 'link', instructions: 'instructions', german: 'word', article: 'article', plural: 'plural', meaning_en: 'English', meaning_bn: 'Bangla', starred: 'star',
  body: 'text', question_state: 'question state', kind: 'kind', tags: 'tags', topic_tags: 'tags', minutes: 'minutes', label: 'label', level: 'level', is_active: 'active', target_end_date: 'end date',
  expires_at: 'expires', example_de: 'example', pronunciation: 'pronunciation', position: 'order', source: 'source', category: 'category', role: 'role', week_no: 'week', priority_: 'priority', manual_pct: 'own %', ready_for_questions: 'ready for questions', exam_date: 'exam date', assignee_id: 'task is for',
};
export const fieldLabel = (k: string): string => FIELD[k] ?? k.replace(/_/g, ' ');

export function formatValue(k: string, v: unknown): string {
  if (k === 'assignee_id') return v ? 'one person' : 'both of us';
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'status' && typeof v === 'string' && v in STATUS_BY_VALUE) return STATUS_BY_VALUE[v as keyof typeof STATUS_BY_VALUE].label;
  if (k === 'manual_pct') return `${v}%`;
  if (k === 'priority') return ({ 1: 'high', 2: 'normal', 3: 'low' } as Record<number, string>)[Number(v)] ?? String(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.join(', ') || '—';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 48 ? s.slice(0, 45) + '…' : s;
}
const HIDDEN = new Set(['version', 'updated_at', 'created_at', 'id']);
export function diffParts(e: ChangeEntry): Array<{ field: string; from: string; to: string }> {
  if (!e.changes) return [];
  return Object.entries(e.changes).filter(([k]) => !HIDDEN.has(k)).map(([k, [a, b]]) => ({ field: fieldLabel(k), from: formatValue(k, a), to: formatValue(k, b) }));
}
export function describe(e: ChangeEntry): string {
  const noun = TABLE_NOUN[e.table_name] ?? e.table_name;
  const verb = e.revert_of ? 'Reverted' : e.op === 'INSERT' ? 'Added' : e.op === 'DELETE' ? 'Deleted' : 'Changed';
  return `${verb} ${noun}`;
}

/** Number of other-person changes per tab since that tab was last opened. */
export function unreadByTab(log: ChangeEntry[], seen: Partial<Record<TabName, string>>, me: string | undefined): Partial<Record<TabName, number>> {
  const out: Partial<Record<TabName, number>> = {};
  for (const e of log) {
    if (!me || e.actor_id === me) continue;
    const tab = TABLE_TAB[e.table_name]; if (!tab) continue;
    const s = seen[tab];
    if (!s || e.created_at > s) out[tab] = (out[tab] ?? 0) + 1;
  }
  return out;
}
/** Latest change per learner (for the "last update" column). */
export function lastUpdateBy(log: ChangeEntry[]): Record<string, ChangeEntry> {
  const out: Record<string, ChangeEntry> = {};
  for (const e of log) if (e.actor_id && (!out[e.actor_id] || e.id > out[e.actor_id].id)) out[e.actor_id] = e;
  return out;
}
