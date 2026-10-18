import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useLearners } from '@/api/queries';
import type { Accent, Learner } from '@/types/db';

/** Two learners, always shown by name/code (IR, LA) — the app never talks about "mine" vs "theirs". `me` is only used to know who is acting. */
export function useWho() {
  const { me } = useAuth();
  const { data } = useLearners();
  return useMemo(() => {
    const learners: Learner[] = (data ?? (me ? [me] : [])).slice().sort((a, b) => a.code.localeCompare(b.code));
    const byId = new Map(learners.map((l) => [l.id, l]));
    return {
      me, learners, byId,
      other: learners.find((l) => l.id !== me?.id) ?? null,
      nameOf: (id: string | null | undefined) => (id ? byId.get(id)?.display_name ?? 'Someone' : '—'),
      codeOf: (id: string | null | undefined) => (id ? byId.get(id)?.code ?? '··' : '··'),
      accentOf: (id: string | null | undefined): Accent => (id ? byId.get(id)?.accent ?? 'blue' : 'blue'),
    };
  }, [data, me]);
}
export type Who = ReturnType<typeof useWho>;
