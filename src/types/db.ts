// Row types mirroring supabase/migrations.
export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'ALL';
export type ThemePref = 'light' | 'dark' | 'system';
export type Accent = 'blue' | 'orange';

export interface Learner { id: string; code: string; display_name: string; accent: Accent; theme_pref: ThemePref; last_login_at: string | null; last_seen_at: string | null; created_at: string }
export interface Plan { id: string; title: string; description: string | null; start_date: string; target_end_date: string; is_active: boolean; created_at: string }
export interface Resource {
  id: string; library_path: string | null; level: Level; category: string; source_folder: string; filename: string; file_type: string; page_count: number | null;
  size_kb: number | null; title: string; external_url: string | null; notes: string | null; is_catalog: boolean; created_at: string;
}
export interface CurriculumWeek { week_no: number; level: string; theme: string; goal: string | null }
export interface CurriculumItem { id: string; week_no: number; position: number; resource_path: string | null; role: string; start_page: number | null; end_page: number | null; est_minutes: number | null; note: string | null; needs_page_selection: boolean }

export interface Goal {
  id: string; plan_id: string | null; title: string; description: string | null; start_date: string; deadline: string; original_deadline: string; priority: 1 | 2 | 3;
  est_minutes: number | null; status: 'active' | 'dropped'; curriculum_week: number | null; created_by: string | null; version: number; created_at: string; updated_at: string;
}
export type ResourceStatus = 'not_started' | 'ready' | 'opened' | 'reading' | 'paused' | 'continuing' | 'completed' | 'awaiting_review' | 'ready_for_questions' | 'needs_help';
export interface GoalResource {
  id: string; goal_id: string; resource_id: string | null; title: string; filename: string | null; level: Level | null; category: string | null; source_folder: string | null;
  file_type: string | null; page_count: number | null; start_page: number | null; end_page: number | null; external_url: string | null; instructions: string | null;
  est_minutes: number | null; measure_unit: string | null; measure_target: number | null; notes: string | null; position: number; version: number; created_at: string; updated_at: string;
}
export interface GoalProgress {
  id: string; goal_resource_id: string; learner_id: string; status: ResourceStatus; current_page: number | null; pages_done: number; measure_done: number; note: string | null;
  minutes_total: number; last_activity_at: string | null; completed_at: string | null; version: number; created_at: string; updated_at: string;
}
export interface StudySession {
  id: string; learner_id: string; goal_id: string | null; goal_resource_id: string | null; label: string | null; started_at: string; ended_at: string | null; minutes: number;
  source: 'manual' | 'timer'; start_page: number | null; end_page: number | null; measure_amount: number | null; interrupted: boolean; note: string | null; created_at: string;
}
export interface PostponementRequest {
  id: string; goal_id: string; requester_id: string; reason: string; original_deadline: string; proposed_deadline: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'; decided_by: string | null; decided_at: string | null; decision_note: string | null; created_at: string;
}
export interface ChangeEntry {
  id: number; actor_id: string | null; table_name: string; row_id: string | null; op: 'INSERT' | 'UPDATE' | 'DELETE'; label: string | null;
  changes: Record<string, [unknown, unknown]> | null; old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null; txid: number;
  revert_of: number | null; reverted_at: string | null; reverted_by: string | null; created_at: string;
}
export type TabName = 'plan' | 'library' | 'words' | 'notes' | 'notices' | 'chat' | 'log';
export interface TabSeen { learner_id: string; tab: TabName; seen_at: string }

export type WordType = 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition' | 'conjunction' | 'pronoun' | 'numeral' | 'phrase' | 'other';
export interface VocabWord {
  id: string; created_by: string; german: string; word_type: WordType; article: 'der' | 'die' | 'das' | null; gender: string | null; plural: string | null;
  details: Record<string, string>; meaning_en: string | null; meaning_bn: string | null; pronunciation: string | null; pronunciation_verified: boolean; translation_verified: boolean;
  example_de: string | null; example_en: string | null; example_bn: string | null; topic_tags: string[]; level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null;
  source: string | null; starred: boolean; note: string | null; created_at: string; updated_at: string;
}
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export interface VocabReviewState { learner_id: string; word_id: string; ease: number; interval_days: number; repetitions: number; lapses: number; due_at: string; last_reviewed_at: string | null }
export interface VocabReviewLog { id: string; learner_id: string; word_id: string; rating: Rating; prior_interval: number; new_interval: number; reviewed_at: string }

export type NoteKind = 'note' | 'word' | 'grammar' | 'question' | 'confusing' | 'reminder';
export interface Note {
  id: string; author_id: string; kind: NoteKind; title: string | null; body: string; category: string | null; tags: string[]; question_state: 'open' | 'answered' | 'discuss' | null;
  link_goal_id: string | null; link_goal_resource_id: string | null; link_resource_id: string | null; link_word_id: string | null; link_page: number | null; link_topic: string | null;
  created_at: string; updated_at: string;
}
export interface NoteReply { id: string; note_id: string; author_id: string; body: string; created_at: string }
export interface Message { id: string; sender_id: string; body: string; created_at: string; read_at: string | null }
export interface Announcement { id: string; author_id: string; title: string; body: string; priority: 'normal' | 'important'; expires_at: string | null; created_at: string; updated_at: string }
export interface AnnouncementRead { announcement_id: string; learner_id: string; read_at: string; dismissed: boolean }
