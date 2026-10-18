import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './useToast';
import { friendlyError } from '@/lib/errors';

/** Runs a mutation with consistent success/error feedback and immediate cache invalidation on this device (realtime covers the other). */
export function useRun() {
  const qc = useQueryClient();
  const toast = useToast();
  return useCallback(async <T,>(fn: () => Promise<T>, opts: { ok?: string; invalidate?: string[] } = {}): Promise<{ ok: true; value: T } | { ok: false }> => {
    try {
      const value = await fn();
      for (const k of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: [k] });
      if (opts.ok) toast.success(opts.ok);
      return { ok: true, value };
    } catch (e) {
      toast.error(friendlyError(e));
      for (const k of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: [k] });  // reload the truth after a failed/conflicting write
      return { ok: false };
    }
  }, [qc, toast]);
}
