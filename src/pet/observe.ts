import type { Goal, GoalProgress, GoalResource, Learner, Message, Note, PostponementRequest, StudySession, VocabReviewState, VocabWord } from '@/types/db';
import { appliesTo, goalState, isReadyForQuestions, measure } from '@/lib/domain/progress';
import { formatDay, toISO } from '@/lib/domain/dates';
import { isDue } from '@/lib/domain/srs';
import type { Mood } from './tips';

export interface Observation { id: string; priority: number; text: string; mood: Mood; to?: string; materialId?: string }
export interface Ctx {
  me: Learner; other: Learner | null; learners: Learner[]; goals: Goal[]; resources: GoalResource[]; progress: GoalProgress[]; sessions: StudySession[];
  words: VocabWord[]; wordState: VocabReviewState[]; notes: Note[]; posts: PostponementRequest[]; messages: Message[]; now: Date;
}
const minutesToday = (s: StudySession[], id: string, today: string) => s.filter((x) => x.learner_id === id && toISO(new Date(x.started_at)) === today).reduce((a, x) => a + x.minutes, 0);

/** The next material this learner should work on: something already started first, then the earliest-due unstarted one. */
export function nextMaterial(c: Pick<Ctx, 'me' | 'goals' | 'resources' | 'progress'>): { r: GoalResource; g: Goal; p?: GoalProgress; started: boolean } | null {
  const active = c.goals.filter((g) => g.status === 'active').sort((a, b) => a.deadline.localeCompare(b.deadline));
  let firstFresh: { r: GoalResource; g: Goal; p?: GoalProgress; started: boolean } | null = null;
  for (const g of active) for (const r of c.resources.filter((x) => x.goal_id === g.id && appliesTo(x, c.me.id))) {
    const p = c.progress.find((x) => x.goal_resource_id === r.id && x.learner_id === c.me.id);
    if (p?.status === 'completed') continue;
    const started = !!p && p.status !== 'not_started' && p.status !== 'ready';
    if (started) return { r, g, p, started: true };
    if (!firstFresh) firstFresh = { r, g, p, started: false };
  }
  return firstFresh;
}

export function observe(c: Ctx): Observation[] {
  const out: Observation[] = []; const today = toISO(c.now); const name = (id: string) => c.learners.find((l) => l.id === id)?.display_name ?? 'Someone';
  for (const p of c.posts) if (p.status === 'pending' && p.requester_id !== c.me.id) out.push({ id: `post-${p.id}`, priority: 95, mood: 'surprised', to: '/plan?v=requests', text: `${name(p.requester_id)} asks to move “${c.goals.find((g) => g.id === p.goal_id)?.title ?? 'a goal'}” to ${formatDay(p.proposed_deadline)}. Your answer is needed.` });
  for (const q of c.progress) if (q.learner_id !== c.me.id && q.status === 'needs_help') { const r = c.resources.find((x) => x.id === q.goal_resource_id); if (r) out.push({ id: `help-${q.id}`, priority: 90, mood: 'worried', to: `/plan?update=${r.id}`, text: `${name(q.learner_id)} needs help with “${r.title}”${q.note ? ` — “${q.note.slice(0, 60)}”` : ''}. Maybe you can explain it?` }); }
  for (const q of c.progress) if (q.learner_id !== c.me.id && isReadyForQuestions(q) && q.status === 'completed') { const r = c.resources.find((x) => x.id === q.goal_resource_id); if (r) out.push({ id: `rq-${q.id}`, priority: 74, mood: 'thinking', to: `/plan?update=${r.id}`, text: `${name(q.learner_id)} finished “${r.title}” and is ready for your questions.` }); }
  const mine = minutesToday(c.sessions, c.me.id, today); const theirs = c.other ? minutesToday(c.sessions, c.other.id, today) : 0;
  const overdue = c.goals.filter((g) => goalState(g, c.resources.filter((r) => r.goal_id === g.id), c.progress, c.learners.map((l) => l.id), today) === 'overdue');
  if (overdue[0]) out.push({ id: `late-${overdue[0].id}`, priority: 80, mood: 'worried', to: `/plan?goal=${overdue[0].id}`, text: `“${overdue[0].title}” was due ${formatDay(overdue[0].deadline)}. Finish it, or ask to postpone — no shame in either.` });
  const nm = nextMaterial(c);
  if (nm?.started) { const m = measure(nm.r, nm.p); out.push({ id: `cont-${nm.r.id}`, priority: 70, mood: 'reading', materialId: nm.r.id, text: `Continue “${nm.r.title}”${nm.p?.current_page ? ` from page ${nm.p.current_page}` : ''}${m.pct !== null ? ` — you are at ${m.pct}%` : ''}.` }); }
  else if (nm) out.push({ id: `next-${nm.r.id}`, priority: 60, mood: 'wave', materialId: nm.r.id, text: `Next up: “${nm.r.title}” for “${nm.g.title}”. Open it and tap Update when you start.` });
  const dueWords = c.words.filter((w) => { const s = c.wordState.find((x) => x.word_id === w.id && x.learner_id === c.me.id); return s && isDue(s.due_at, c.now); }).length;
  const newWords = c.words.filter((w) => !c.wordState.some((x) => x.word_id === w.id && x.learner_id === c.me.id)).length;
  if (dueWords > 0) out.push({ id: 'words-due', priority: 65, mood: 'happy', to: '/words', text: `${dueWords} word${dueWords > 1 ? 's are' : ' is'} ready for review. It takes about two minutes.` });
  else if (newWords > 0) out.push({ id: 'words-new', priority: 40, mood: 'reading', to: '/words', text: `${newWords} new word${newWords > 1 ? 's' : ''} waiting to be learned.` });
  const q = c.notes.find((n) => n.kind === 'question' && n.question_state !== 'answered' && n.author_id !== c.me.id);
  if (q) out.push({ id: `q-${q.id}`, priority: 75, mood: 'thinking', to: `/notes?note=${q.id}`, text: `${name(q.author_id)} has a question: “${(q.title ?? q.body).slice(0, 70)}”` });
  const unread = c.messages.filter((m) => m.sender_id !== c.me.id && !m.read_at).length;
  if (unread) out.push({ id: 'chat', priority: 72, mood: 'wave', to: '/chat', text: `${unread} unread message${unread > 1 ? 's' : ''} from ${c.other?.display_name ?? 'your partner'}.` });
  if (c.goals.filter((g) => g.status === 'active').length === 0) out.push({ id: 'no-goal', priority: 85, mood: 'thinking', to: '/plan?new=1', text: 'There is no active goal yet. Create one — a few files and page numbers are enough.' });
  if (mine > 0 && theirs > 0) out.push({ id: 'both', priority: 50, mood: 'cheer', text: `You both studied today — ${mine} and ${theirs} minutes. Wunderbar!` });
  else if (mine > 0) out.push({ id: 'me-done', priority: 45, mood: 'proud', text: `${mine} minutes today. Gut gemacht!` });
  else if (theirs > 0) out.push({ id: 'they-done', priority: 55, mood: 'happy', text: `${c.other?.display_name} already studied ${theirs} minutes today. Ten minutes for you?` });
  else out.push({ id: 'none-today', priority: 30, mood: 'idle', text: 'Nobody has studied yet today. Ten minutes is enough to start.' });
  return out.sort((a, b) => b.priority - a.priority);
}

/** The next few materials for this learner: ones already started first, then the rest by goal deadline. */
export function upNext(c: Pick<Ctx, 'me' | 'goals' | 'resources' | 'progress'>, limit = 3): Array<{ r: GoalResource; g: Goal; started: boolean }> {
  const started: Array<{ r: GoalResource; g: Goal; started: boolean }> = []; const fresh: Array<{ r: GoalResource; g: Goal; started: boolean }> = [];
  for (const g of c.goals.filter((x) => x.status === 'active').sort((a, b) => a.deadline.localeCompare(b.deadline))) for (const r of c.resources.filter((x) => x.goal_id === g.id && appliesTo(x, c.me.id))) {
    const p = c.progress.find((x) => x.goal_resource_id === r.id && x.learner_id === c.me.id);
    if (p?.status === 'completed') continue;
    (p && p.status !== 'not_started' && p.status !== 'ready' ? started : fresh).push({ r, g, started: !!p && p.status !== 'not_started' && p.status !== 'ready' });
  }
  return [...started, ...fresh].slice(0, limit);
}
