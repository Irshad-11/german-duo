export type LinkKind = 'drive-file' | 'drive-folder' | 'google-doc' | 'other';
export interface LinkCheck { ok: boolean; kind: LinkKind | null; message?: string; normalized?: string }

/**
 * Validates the *shape* of a link. The browser cannot verify that a Google Drive file is shared with you
 * (cross-origin), so inaccessible links are handled in the UI with guidance instead of a false "verified".
 */
export function checkResourceUrl(input: string): LinkCheck {
  const raw = input.trim();
  if (!raw) return { ok: true, kind: null };
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, kind: null, message: 'Enter a full link starting with https://' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, kind: null, message: 'Only http(s) links are allowed.' };
  const host = u.hostname.toLowerCase();
  if (host === 'drive.google.com') {
    if (/\/folders\//.test(u.pathname)) return { ok: true, kind: 'drive-folder', normalized: u.toString() };
    if (/\/file\/d\/[\w-]{10,}/.test(u.pathname) || (u.pathname === '/open' && u.searchParams.get('id')) || (u.pathname === '/uc' && u.searchParams.get('id')))
      return { ok: true, kind: 'drive-file', normalized: u.toString() };
    return { ok: false, kind: 'drive-file', message: 'This Drive link looks incomplete. Use “Share → Copy link”.' };
  }
  if (host === 'docs.google.com') return { ok: true, kind: 'google-doc', normalized: u.toString() };
  if (u.protocol === 'http:') return { ok: true, kind: 'other', message: 'This link is not encrypted (http).', normalized: u.toString() };
  return { ok: true, kind: 'other', normalized: u.toString() };
}

export const LINK_HELP = 'If Google says “You need access”, ask the file owner to share it with “Anyone with the link” or with your Google account, then reopen the link.';
