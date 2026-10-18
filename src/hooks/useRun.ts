import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './useToast';
import { friendlyError } from '@/lib/errors';
import { latestLogId, revertChange } from '@/api/mutations';

export interface UndoSpec { table: string; rowId: string | ((value: never) => string); op: 'INSERT' | 'UPDATE' | 'DELETE' }
/** Runs a mutation with consistent feedback. With `undo`, the success toast carries an Undo button that reverts exactly what was just done
 *  (confirmation dialogs are avoided on purpose: undo is cheaper and safer for reversible actions). */
export function useRun() {
  const qc = useQueryClient(); const toast = useToast();
  const refresh = useCallback(() => { void qc.invalidateQueries(); }, [qc]);
  return useCallback(async <T,>(fn: () => Promise<T>, opts: { ok?: string; invalidate?: string[]; undo?: { table: string; rowId?: string; op: 'INSERT' | 'UPDATE' | 'DELETE'; fromResult?: (v: T) => string } } = {}): Promise<{ ok: true; value: T } | { ok: false }> => {
    try {
      const value = await fn();
      for (const k of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: [k] });
      const u = opts.undo;
      if (u && opts.ok) {
        const rowId = u.rowId ?? (u.fromResult ? u.fromResult(value) : undefined);
        let id: number | null = null;
        if (rowId) { try { id = await latestLogId(u.table, rowId, u.op); } catch { id = null; } }
        if (id !== null) {
          const entry = id;
          toast.undoable(opts.ok, () => { void revertChange(entry, u.op === 'DELETE').then(() => { toast.info('Undone'); refresh(); }, (e) => toast.error(friendlyError(e))); });
        } else toast.success(opts.ok);
      } else if (opts.ok) toast.success(opts.ok);
      return { ok: true, value };
    } catch (e) {
      toast.error(friendlyError(e));
      for (const k of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: [k] });
      return { ok: false };
    }
  }, [qc, toast, refresh]);
}
