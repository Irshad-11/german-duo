import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { addDays, toISO } from '@/lib/domain/dates';
import type {
  ActivityEntry, Announcement, AnnouncementRead, AppNotification, CurriculumItem, CurriculumWeek, Goal, GoalDeadlineHistory, GoalResource, Learner, Message, Note,
  NoteReply, Plan, PostponementRequest, Resource, ResourceStatusHistory, StudySession, VocabAnnotation, VocabFavorite, VocabReviewLog, VocabReviewState, VocabWord,
} from '@/types/db';

function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw res.error;
  return (res.data ?? ([] as unknown)) as T;
}
const STALE = 15_000;
const useQ = <T,>(key: string[], fn: () => Promise<T>, enabled = true) => useQuery({ queryKey: key, queryFn: fn, staleTime: STALE, enabled });

export const useLearners = () => useQ<Learner[]>(['learners'], async () => must(await supabase.from('learners').select('*').order('code')));
export const usePlan = () => useQ<Plan | null>(['plan'], async () => {
  const r = await supabase.from('plans').select('*').eq('is_active', true).maybeSingle();
  if (r.error) throw r.error; return (r.data as Plan | null) ?? null;
});
export const useGoals = () => useQ<Goal[]>(['goals'], async () => must(await supabase.from('goals').select('*').order('deadline').order('created_at')));
export const useGoalResources = () => useQ<GoalResource[]>(['goal_resources'], async () => must(await supabase.from('goal_resources').select('*').order('position').order('created_at')));
export const useSessions = () => useQ<StudySession[]>(['sessions'], async () => {
  const since = toISO(addDays(new Date(), -400));
  return must(await supabase.from('study_sessions').select('*').gte('started_at', since).order('started_at', { ascending: false }).limit(3000));
});
export const useActivity = () => useQ<ActivityEntry[]>(['activity'], async () => must(await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(60)));
export const usePostponements = () => useQ<PostponementRequest[]>(['postponements'], async () => must(await supabase.from('postponement_requests').select('*').order('created_at', { ascending: false })));
export const useDeadlineHistory = () => useQ<GoalDeadlineHistory[]>(['deadline_history'], async () => must(await supabase.from('goal_deadline_history').select('*').order('created_at', { ascending: false })));
export const useStatusHistory = (goalResourceId: string | null) =>
  useQuery({ queryKey: ['status_history', goalResourceId], enabled: !!goalResourceId, staleTime: STALE,
    queryFn: async () => must(await supabase.from('resource_status_history').select('*').eq('goal_resource_id', goalResourceId!).order('created_at', { ascending: false })) as ResourceStatusHistory[] });
export const useResources = () => useQ<Resource[]>(['resources'], async () => must(await supabase.from('resources').select('*').order('library_path', { nullsFirst: false })));
export const useCurriculum = () => useQ<{ weeks: CurriculumWeek[]; items: CurriculumItem[] }>(['curriculum'], async () => {
  const [w, i] = await Promise.all([supabase.from('curriculum_weeks').select('*').order('week_no'), supabase.from('curriculum_items').select('*').order('week_no').order('position')]);
  return { weeks: must(w) as CurriculumWeek[], items: must(i) as CurriculumItem[] };
});

export const useVocab = () => useQ<VocabWord[]>(['vocab'], async () => must(await supabase.from('vocab_words').select('*').order('created_at', { ascending: false })));
export const useVocabState = () => useQ<VocabReviewState[]>(['vocab_state'], async () => must(await supabase.from('vocab_review_state').select('*')));
export const useVocabFav = () => useQ<VocabFavorite[]>(['vocab_fav'], async () => must(await supabase.from('vocab_favorites').select('*')));
export const useVocabAnn = () => useQ<VocabAnnotation[]>(['vocab_ann'], async () => must(await supabase.from('vocab_annotations').select('*')));
export const useVocabLog = () => useQ<VocabReviewLog[]>(['vocab_log'], async () => {
  const since = toISO(addDays(new Date(), -60));
  return must(await supabase.from('vocab_review_log').select('*').gte('reviewed_at', since).order('reviewed_at', { ascending: false }).limit(3000));
});

export const useNotes = () => useQ<Note[]>(['notes'], async () => must(await supabase.from('notes').select('*').order('updated_at', { ascending: false })));
export const useReplies = (noteId: string | null) =>
  useQuery({ queryKey: ['replies', noteId], enabled: !!noteId, staleTime: STALE,
    queryFn: async () => must(await supabase.from('note_replies').select('*').eq('note_id', noteId!).order('created_at')) as NoteReply[] });
export const useMessages = () => useQ<Message[]>(['messages'], async () => {
  const rows = must(await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(300)) as Message[];
  return rows.reverse();
});
export const useAnnouncements = () => useQ<Announcement[]>(['announcements'], async () => must(await supabase.from('announcements').select('*').order('created_at', { ascending: false })));
export const useAnnReads = () => useQ<AnnouncementRead[]>(['ann_reads'], async () => must(await supabase.from('announcement_reads').select('*')));
export const useNotifications = () => useQ<AppNotification[]>(['notifications'], async () => must(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)));
