import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { addDays, toISO } from '@/lib/domain/dates';
import type { Announcement, AnnouncementRead, ChangeEntry, CurriculumItem, CurriculumWeek, Goal, GoalProgress, GoalResource, Learner, Message, Note, NoteReply, Plan, PostponementRequest,
  Resource, StudySession, TabSeen, VocabReviewLog, VocabReviewState, VocabWord } from '@/types/db';

function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T { if (res.error) throw res.error; return (res.data ?? ([] as unknown)) as T; }
const STALE = 15_000;
const useQ = <T,>(key: string[], fn: () => Promise<T>) => useQuery({ queryKey: key, queryFn: fn, staleTime: STALE });

export const useLearners = () => useQ<Learner[]>(['learners'], async () => must(await supabase.from('learners').select('*').order('code')));
export const usePlan = () => useQ<Plan | null>(['plan'], async () => { const r = await supabase.from('plans').select('*').eq('is_active', true).maybeSingle(); if (r.error) throw r.error; return (r.data as Plan | null) ?? null; });
export const useGoals = () => useQ<Goal[]>(['goals'], async () => must(await supabase.from('goals').select('*').order('start_date').order('created_at')));
export const useGoalResources = () => useQ<GoalResource[]>(['goal_resources'], async () => must(await supabase.from('goal_resources').select('*').order('position').order('created_at')));
export const useProgress = () => useQ<GoalProgress[]>(['goal_progress'], async () => must(await supabase.from('goal_progress').select('*')));
export const useSessions = () => useQ<StudySession[]>(['sessions'], async () =>
  must(await supabase.from('study_sessions').select('*').gte('started_at', toISO(addDays(new Date(), -400))).order('started_at', { ascending: false }).limit(3000)));
export const usePostponements = () => useQ<PostponementRequest[]>(['postponements'], async () => must(await supabase.from('postponement_requests').select('*').order('created_at', { ascending: false })));
export const useChangeLog = (limit = 400) => useQ<ChangeEntry[]>(['change_log', String(limit)], async () =>
  must(await supabase.from('change_log').select('*').order('id', { ascending: false }).limit(limit)));
export const useTabSeen = () => useQ<TabSeen[]>(['tab_seen'], async () => must(await supabase.from('tab_seen').select('*')));
export const useResources = () => useQ<Resource[]>(['resources'], async () => must(await supabase.from('resources').select('*').order('library_path', { nullsFirst: false })));
export const useCurriculum = () => useQ<{ weeks: CurriculumWeek[]; items: CurriculumItem[] }>(['curriculum'], async () => {
  const [w, i] = await Promise.all([supabase.from('curriculum_weeks').select('*').order('week_no'), supabase.from('curriculum_items').select('*').order('week_no').order('position')]);
  return { weeks: must(w) as CurriculumWeek[], items: must(i) as CurriculumItem[] };
});
export const useVocab = () => useQ<VocabWord[]>(['vocab'], async () => must(await supabase.from('vocab_words').select('*').order('created_at', { ascending: false })));
export const useVocabState = () => useQ<VocabReviewState[]>(['vocab_state'], async () => must(await supabase.from('vocab_review_state').select('*')));
export const useVocabLog = () => useQ<VocabReviewLog[]>(['vocab_log'], async () =>
  must(await supabase.from('vocab_review_log').select('*').gte('reviewed_at', toISO(addDays(new Date(), -60))).order('reviewed_at', { ascending: false }).limit(3000)));
export const useNotes = () => useQ<Note[]>(['notes'], async () => must(await supabase.from('notes').select('*').order('updated_at', { ascending: false })));
export const useReplies = (noteId: string | null) => useQuery({ queryKey: ['replies', noteId], enabled: !!noteId, staleTime: STALE,
  queryFn: async () => must(await supabase.from('note_replies').select('*').eq('note_id', noteId!).order('created_at')) as NoteReply[] });
export const useMessages = () => useQ<Message[]>(['messages'], async () => (must(await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(300)) as Message[]).reverse());
export const useAnnouncements = () => useQ<Announcement[]>(['announcements'], async () => must(await supabase.from('announcements').select('*').order('created_at', { ascending: false })));
export const useAnnReads = () => useQ<AnnouncementRead[]>(['ann_reads'], async () => must(await supabase.from('announcement_reads').select('*')));
