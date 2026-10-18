import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useLearners } from '@/api/queries';
import type { Learner } from '@/types/db';

/** "me" vs "partner" resolution for the two-learner model. */
export function useWho() {
  const { me } = useAuth();
  const { data } = useLearners();
  return useMemo(() => {
    const learners: Learner[] = data ?? (me ? [me] : []);
    const partner = learners.find((l) => l.id !== me?.id) ?? null;
    const byId = new Map(learners.map((l) => [l.id, l]));
    return {
      me, partner, learners, byId,
      nameOf: (id: string | null | undefined) => (id ? (id === me?.id ? 'You' : byId.get(id)?.display_name ?? 'Partner') : 'Shared'),
      codeOf: (id: string | null | undefined) => (id ? byId.get(id)?.code ?? '··' : '··'),
      accentOf: (id: string | null | undefined): 'cobalt' | 'teal' | 'amber' => (id ? byId.get(id)?.accent ?? 'cobalt' : 'amber'),
    };
  }, [data, me]);
}
export type Who = ReturnType<typeof useWho>;
