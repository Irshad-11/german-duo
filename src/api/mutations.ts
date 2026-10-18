import { supabase } from '@/lib/supabase';
import { INITIAL_SRS, schedule, type SrsState } from '@/lib/domain/srs';
import type { Announcement, CurriculumItem, Goal, GoalProgress, GoalResource, Message, Note, Plan, Rating, Resource, StudySession, ThemePref, VocabWord } from '@/types/db';

type Err = { message: string; code?: string } | null;
const ok = (e: Err) => { if (e) throw e; };

export async function touchSession(login: boolean) { await supabase.rpc('touch_session', { p_login: login }); }
export async function updateProfile(id: string, patch: { theme_pref?: ThemePref; display_name?: string }) { ok((await supabase.from('learners').update(patch).eq('id', id)).error); }
export async function markTabSeen(learnerId: string, tab: string) { ok((await supabase.from('tab_seen').upsert({ learner_id: learnerId, tab, seen_at: new Date().toISOString() })).error); }
export async function revertChange(id: number, group = false): Promise<number> {
  const r = await supabase.rpc('revert_change', { p_id: id, p_group: group }); ok(r.error); return Number(r.data ?? 0);
}
/** Latest log entry for a row, so the UI can offer "Undo" right after an action. */
export async function latestLogId(table: string, rowId: string, op: 'INSERT' | 'UPDATE' | 'DELETE'): Promise<number | null> {
  const r = await supabase.from('change_log').select('id').eq('table_name', table).eq('row_id', rowId).eq('op', op).is('reverted_at', null).order('id', { ascending: false }).limit(1);
  ok(r.error); return (r.data?.[0] as { id: number } | undefined)?.id ?? null;
}

export async function updatePlan(id: string, patch: Partial<Pick<Plan, 'title' | 'description' | 'start_date' | 'target_end_date'>>) { ok((await supabase.from('plans').update(patch).eq('id', id)).error); }
export async function replacePlan(oldId: string | null, next: { title: string; description: string | null; start_date: string; target_end_date: string }) {
  if (oldId) ok((await supabase.from('plans').update({ is_active: false }).eq('id', oldId)).error);
  ok((await supabase.from('plans').insert({ ...next, is_active: true })).error);
}

export type ResourceInput = Pick<Resource, 'level' | 'category' | 'source_folder' | 'filename' | 'file_type' | 'page_count' | 'title' | 'external_url' | 'notes'>;
export async function createResource(input: ResourceInput): Promise<Resource> { const r = await supabase.from('resources').insert(input).select().single(); ok(r.error); return r.data as Resource; }
export async function updateResource(id: string, patch: Partial<ResourceInput>) { ok((await supabase.from('resources').update(patch).eq('id', id)).error); }
export async function deleteResource(id: string) { ok((await supabase.from('resources').delete().eq('id', id)).error); }
export async function updateCurriculumItem(id: string, patch: Partial<Pick<CurriculumItem, 'start_page' | 'end_page' | 'est_minutes' | 'note' | 'role'>>) { ok((await supabase.from('curriculum_items').update(patch).eq('id', id)).error); }
export async function deleteCurriculumItem(id: string) { ok((await supabase.from('curriculum_items').delete().eq('id', id)).error); }
export async function addCurriculumItem(item: Omit<CurriculumItem, 'id'>) { ok((await supabase.from('curriculum_items').insert(item)).error); }

export type GoalInput = Pick<Goal, 'title' | 'description' | 'start_date' | 'deadline' | 'priority' | 'est_minutes' | 'curriculum_week' | 'plan_id'>;
export type GoalResourceInput = Partial<Omit<GoalResource, 'id' | 'goal_id' | 'version' | 'created_at' | 'updated_at'>> & { title: string };
export async function createGoal(input: GoalInput, resources: GoalResourceInput[]): Promise<string> {
  const g = await supabase.from('goals').insert(input).select('id').single(); ok(g.error);
  const id = (g.data as { id: string }).id;
  if (resources.length) {
    const r = await supabase.from('goal_resources').insert(resources.map((x, i) => ({ ...x, goal_id: id, position: i })));
    if (r.error) { await supabase.from('goals').delete().eq('id', id); throw r.error; }
  }
  return id;
}
export async function updateGoal(id: string, patch: Partial<Pick<Goal, 'title' | 'description' | 'priority' | 'est_minutes' | 'status' | 'start_date'>>) { ok((await supabase.from('goals').update(patch).eq('id', id)).error); }
export async function deleteGoal(id: string) { ok((await supabase.from('goals').delete().eq('id', id)).error); }
export async function addGoalResource(goalId: string, r: GoalResourceInput, position: number) { ok((await supabase.from('goal_resources').insert({ ...r, goal_id: goalId, position })).error); }
export async function updateGoalResource(id: string, patch: Partial<GoalResource>) {
  const { id: _i, version: _v, created_at: _c, updated_at: _u, goal_id: _g, ...clean } = patch as GoalResource; void [_i, _v, _c, _u, _g];
  ok((await supabase.from('goal_resources').update(clean).eq('id', id)).error);
}
export async function deleteGoalResource(id: string) { ok((await supabase.from('goal_resources').delete().eq('id', id)).error); }
export async function reorderGoalResources(order: string[]) { await Promise.all(order.map(async (id, i) => ok((await supabase.from('goal_resources').update({ position: i }).eq('id', id)).error))); }

/** Upserts the signed-in learner's progress row for an assignment. */
export async function saveProgress(learnerId: string, goalResourceId: string, patch: Partial<Pick<GoalProgress, 'status' | 'current_page' | 'pages_done' | 'measure_done' | 'note'>>): Promise<string> {
  const r = await supabase.from('goal_progress').upsert({ goal_resource_id: goalResourceId, learner_id: learnerId, ...patch }, { onConflict: 'goal_resource_id,learner_id' }).select('id').single();
  ok(r.error); return (r.data as { id: string }).id;
}
export type SessionInput = Pick<StudySession, 'minutes' | 'source'> & Partial<Pick<StudySession, 'goal_id' | 'goal_resource_id' | 'label' | 'started_at' | 'ended_at' | 'start_page' | 'end_page' | 'measure_amount' | 'interrupted' | 'note'>>;
export async function logSession(input: SessionInput): Promise<string> { const r = await supabase.from('study_sessions').insert(input).select('id').single(); ok(r.error); return (r.data as { id: string }).id; }
export async function deleteSession(id: string) { ok((await supabase.from('study_sessions').delete().eq('id', id)).error); }

export async function requestPostponement(goalId: string, proposed: string, reason: string) { ok((await supabase.rpc('request_postponement', { p_goal: goalId, p_proposed: proposed, p_reason: reason })).error); }
export async function decidePostponement(id: string, approve: boolean, note: string | null) { ok((await supabase.rpc('decide_postponement', { p_request: id, p_approve: approve, p_note: note })).error); }
export async function cancelPostponement(id: string) { ok((await supabase.rpc('cancel_postponement', { p_request: id })).error); }

export type WordInput = Omit<VocabWord, 'id' | 'created_by' | 'gender' | 'created_at' | 'updated_at'>;
export async function addWord(w: WordInput): Promise<string> { const r = await supabase.from('vocab_words').insert(w).select('id').single(); ok(r.error); return (r.data as { id: string }).id; }
export async function updateWord(id: string, w: Partial<WordInput>) { ok((await supabase.from('vocab_words').update(w).eq('id', id)).error); }
export async function deleteWord(id: string) { ok((await supabase.from('vocab_words').delete().eq('id', id)).error); }
export async function reviewWord(learnerId: string, wordId: string, prior: SrsState | null, rating: Rating) {
  const before = prior ?? INITIAL_SRS; const next = schedule(before, rating);
  ok((await supabase.from('vocab_review_state').upsert({ learner_id: learnerId, word_id: wordId, ease: next.ease, interval_days: next.interval_days, repetitions: next.repetitions, lapses: next.lapses, due_at: next.due_at.toISOString(), last_reviewed_at: new Date().toISOString() })).error);
  ok((await supabase.from('vocab_review_log').insert({ learner_id: learnerId, word_id: wordId, rating, prior_interval: before.interval_days, new_interval: next.interval_days })).error);
}

export type NoteInput = Pick<Note, 'kind' | 'body'> & Partial<Pick<Note, 'title' | 'category' | 'tags' | 'question_state' | 'link_goal_id' | 'link_goal_resource_id' | 'link_resource_id' | 'link_word_id' | 'link_page' | 'link_topic'>>;
export async function createNote(n: NoteInput): Promise<string> { const r = await supabase.from('notes').insert(n).select('id').single(); ok(r.error); return (r.data as { id: string }).id; }
export async function updateNote(id: string, n: Partial<NoteInput>) { ok((await supabase.from('notes').update(n).eq('id', id)).error); }
export async function deleteNote(id: string) { ok((await supabase.from('notes').delete().eq('id', id)).error); }
export async function setQuestionState(id: string, state: 'open' | 'answered' | 'discuss') { ok((await supabase.from('notes').update({ question_state: state }).eq('id', id)).error); }
export async function addReply(noteId: string, body: string) { ok((await supabase.from('note_replies').insert({ note_id: noteId, body })).error); }
export async function deleteReply(id: string) { ok((await supabase.from('note_replies').delete().eq('id', id)).error); }

export async function sendMessage(m: Pick<Message, 'id' | 'body'>) { const r = await supabase.from('messages').insert(m); if (r.error && r.error.code !== '23505') throw r.error; }
export async function markMessagesRead() { ok((await supabase.rpc('mark_messages_read')).error); }

export type AnnouncementInput = Pick<Announcement, 'title' | 'body' | 'priority' | 'expires_at'>;
export async function createAnnouncement(a: AnnouncementInput): Promise<string> { const r = await supabase.from('announcements').insert(a).select('id').single(); ok(r.error); return (r.data as { id: string }).id; }
export async function updateAnnouncement(id: string, a: Partial<AnnouncementInput>) { ok((await supabase.from('announcements').update(a).eq('id', id)).error); }
export async function deleteAnnouncement(id: string) { ok((await supabase.from('announcements').delete().eq('id', id)).error); }
export async function setAnnouncementRead(learnerId: string, id: string, dismissed: boolean) { ok((await supabase.from('announcement_reads').upsert({ announcement_id: id, learner_id: learnerId, dismissed, read_at: new Date().toISOString() })).error); }

export async function rotateAccessKey(email: string, currentKey: string, newKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const check = await supabase.auth.signInWithPassword({ email, password: currentKey });
  if (check.error) return { ok: false, message: check.error.status === 429 ? 'Too many attempts. Try again later.' : 'The current key is not correct.' };
  const { error } = await supabase.auth.updateUser({ password: newKey });
  return error ? { ok: false, message: error.message } : { ok: true };
}
