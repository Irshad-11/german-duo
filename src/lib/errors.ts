interface ErrLike { message?: string; code?: string; status?: number; details?: string }

/** Maps Postgres/PostgREST/network errors to plain-language messages. */
export function friendlyError(err: unknown): string {
  const e = (err ?? {}) as ErrLike;
  const msg = e.message ?? String(err ?? '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'No connection. Check your internet and try again.';
  if (/jwt expired|invalid jwt|not authenticated|refresh token/i.test(msg) || e.status === 401) return 'Your session expired. Please sign in again.';
  switch (e.code) {
    case '42501': return /row-level security|permission denied/i.test(msg) ? 'You do not have permission to do that.' : msg;
    case '23505': return /vocab_unique/.test(msg) ? 'That word is already in the collection.' : 'That already exists.';
    case '23503': return 'That item refers to something that no longer exists.';
    case '23514': return /pages_done|end_page|start_page|page_count/.test(msg) ? 'Check the page numbers: they must stay inside the book and the assigned range.' : 'Some values are out of range.';
    case '22023': case 'P0002': return msg;
    case 'PGRST116': return 'That item was not found, or it was changed by someone else.';
  }
  if (/row-level security/i.test(msg)) return 'You do not have permission to do that.';
  return msg || 'Something went wrong. Please try again.';
}

export class ConflictError extends Error {
  constructor() { super('This was changed on another device. The latest version has been loaded — please try again.'); }
}
