import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateGoal, updateGoalResource, logSession, type SessionInput } from '@/api/mutations';
import { useToast } from './useToast';
import { friendlyError } from '@/lib/errors';
import { assignedPages, clampPage } from '@/lib/domain/progress';
import { statusLabel } from '@/lib/domain/status';
import type { Goal, GoalResource, ResourceStatus } from '@/types/db';

/** Optimistic, version-checked updates for assignments (safe: the DB rejects stale versions and we roll back). */
export function useResourceActions() {
  const qc = useQueryClient();
  const toast = useToast();

  const patch = useCallback(async (r: GoalResource, p: Partial<GoalResource>, okMsg?: string): Promise<boolean> => {
    const key = ['goal_resources'];
    await qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<GoalResource[]>(key);
    qc.setQueryData<GoalResource[]>(key, (xs) => xs?.map((x) => (x.id === r.id ? { ...x, ...p, version: x.version + 1 } : x)));
    try {
      await updateGoalResource(r.id, r.version, p);
      if (okMsg) toast.success(okMsg);
      return true;
    } catch (e) {
      qc.setQueryData(key, prev);
      toast.error(friendlyError(e));
      return false;
    } finally { void qc.invalidateQueries({ queryKey: key }); }
  }, [qc, toast]);

  const setStatus = useCallback(async (r: GoalResource, status: ResourceStatus, goal?: Goal): Promise<boolean> => {
    const p: Partial<GoalResource> = { status };
    const total = assignedPages(r);
    if ((status === 'reading' || status === 'continuing') && r.current_page == null && r.start_page != null) p.current_page = r.start_page;
    if (status === 'completed') { if (total !== null) { p.pages_done = total; p.current_page = r.end_page; } }
    const ok = await patch(r, p, status === 'completed' ? 'Marked complete' : `Status: ${statusLabel(status)}`);
    if (ok && goal && goal.status === 'planned' && status !== 'ready' && status !== 'not_started') {
      try { await updateGoal(goal.id, goal.version, { status: 'in_progress' }); void qc.invalidateQueries({ queryKey: ['goals'] }); } catch { /* non-critical */ }
    }
    return ok;
  }, [patch, qc]);

  /** "I have read up to page N": records current page and pages done (assuming sequential reading from the first assigned page). */
  const readUpTo = useCallback(async (r: GoalResource, page: number): Promise<boolean> => {
    const p = clampPage(page, r);
    const done = r.start_page != null ? p - r.start_page + 1 : r.pages_done;
    const next: Partial<GoalResource> = { current_page: p, pages_done: Math.max(0, done) };
    if (r.status === 'not_started' || r.status === 'ready' || r.status === 'opened' || r.status === 'paused') next.status = r.status === 'paused' ? 'continuing' : 'reading';
    return patch(r, next, `Saved: up to page ${p}`);
  }, [patch]);

  const quickLog = useCallback(async (r: GoalResource, minutes: number, extra: Partial<SessionInput> = {}): Promise<boolean> => {
    try {
      await logSession({ minutes, source: 'manual', goal_id: r.goal_id, goal_resource_id: r.id, label: r.title, ...extra });
      toast.success(`Logged ${minutes} min`);
      void qc.invalidateQueries({ queryKey: ['sessions'] }); void qc.invalidateQueries({ queryKey: ['goal_resources'] });
      return true;
    } catch (e) { toast.error(friendlyError(e)); return false; }
  }, [qc, toast]);

  return { patch, setStatus, readUpTo, quickLog };
}
