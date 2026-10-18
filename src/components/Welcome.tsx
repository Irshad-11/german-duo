import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useQuick } from '@/hooks/useQuick';
import { Button } from '@/components/ui/ui';

export interface WelcomeState { hasGoal: boolean; hasLink: boolean; hasSession: boolean; hasWord: boolean; otherSeen: boolean; otherName: string }
/** First-run checklist: five small steps with one obvious button each. Disappears when all are done. */
export function Welcome({ s }: { s: WelcomeState }) {
  const quick = useQuick();
  const steps = [
    { done: s.hasGoal, title: 'Create the first goal', hint: 'A goal is a few materials with page numbers. Both of you follow it.', action: <Link className="btn btn-primary btn-sm" to="/plan?new=1">Create goal</Link> },
    { done: s.hasLink, title: 'Save a link to a file', hint: 'Open a material, find the file in the shared Drive folder and paste its link once.', action: <Link className="btn btn-sm" to="/library">Open library</Link> },
    { done: s.hasSession, title: 'Log your first study time', hint: 'Ten minutes is enough. “Update progress & time” on a material does it in one go.', action: <Button size="sm" onClick={quick.openSession}>Log time</Button> },
    { done: s.hasWord, title: 'Add a word', hint: 'Words are shared. Add the article and plural for nouns.', action: <Button size="sm" onClick={() => quick.openWord()}>Add word</Button> },
    { done: s.otherSeen, title: `Wait for ${s.otherName || 'the other learner'} to sign in`, hint: 'You will see their last login here as soon as they open the app.', action: null },
  ];
  const done = steps.filter((x) => x.done).length; if (done === steps.length) return null;
  return (
    <section className="welcome" aria-labelledby="w-h"><h2 id="w-h">Getting started <span className="muted small">{done} of {steps.length}</span></h2>
      <ol className="plain-list welcome-list">{steps.map((st, i) => (
        <li key={i} className={st.done ? 'wdone' : ''}><span className="wmark" aria-hidden>{st.done ? <Check size={14} /> : i + 1}</span><div className="grow"><b>{st.title}</b><p className="small muted">{st.hint}</p></div>{!st.done && st.action}</li>))}</ol>
    </section>
  );
}
