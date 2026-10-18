// Shared (Node + test) inventory helpers.
const ROOT_DEPTH = 2; // depth 0 = zip root folder, depth 1 = inner root, depth 2+ = real hierarchy

export function parseSize(s) {
  const m = /^([\d.]+)\s*(KB|MB|GB)$/i.exec(s.trim());
  if (!m) return null;
  const mult = { KB: 1, MB: 1024, GB: 1024 * 1024 }[m[2].toUpperCase()];
  return Math.round(parseFloat(m[1]) * mult * 100) / 100; // size in KB
}

export function parseTree(text) {
  const out = [];
  const stack = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    const m = /^((?:│ {3}| {4})*)(?:├── |└── )(.*)$/.exec(raw);
    let depth; let body;
    if (m) { depth = m[1].length / 4 + 1; body = m[2]; } else { depth = 0; body = raw; }
    if (body.endsWith('/') && !body.includes(' | ')) { stack[depth] = body.slice(0, -1); stack.length = depth + 1; continue; }
    const parts = body.split(' | ');
    const filename = parts[0].trim();
    const size_kb = parts[1] ? parseSize(parts[1]) : null;
    let page_count = null;
    if (parts[2]) { const pm = /^(\d+)\s+pages?$/.exec(parts[2].trim()); page_count = pm ? Number(pm[1]) : null; }
    const folders = stack.slice(ROOT_DEPTH, depth);
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const levelMatch = folders[0];
    let level = /^(A1|A2|B1|B2|C1|C2)$/.test(levelMatch) ? levelMatch : (/\b(A1|A2|B1|B2|C1|C2)\b/.exec(filename)?.[1] ?? 'ALL');
    out.push({
      library_path: [...folders, filename].join('/'),
      level, source_folder: folders.join('/'), filename, file_type: ext, page_count, size_kb,
    });
  }
  return out;
}

export function resolveRef(library, ref) {
  const idx = ref.indexOf(':');
  const level = ref.slice(0, idx); const prefix = ref.slice(idx + 1);
  const hits = library.filter((r) => r.level === level && r.filename.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`Curriculum ref "${ref}" matched ${hits.length} files`);
  return hits[0];
}

export function buildCategory(r) {
  const f = r.filename.toLowerCase(); const folder = r.source_folder.toLowerCase();
  if (folder.includes('course')) return 'grammar-lesson';
  if (folder.includes('story')) return 'story';
  if (folder.includes('schreib')) return 'writing';
  if (folder.includes('sprechen')) return 'speaking';
  if (folder.includes('vocabulary') || /glossar|wortliste/.test(f)) return 'vocabulary';
  if (/modell|modelsatz|uebungssatz|übungssatz|pruefung|prüfung|telc|a1-pr_|goethe-zertifikat|a2_model/.test(f)) return 'exam';
  if (/loesungen|lösungen/.test(f)) return 'answer-key';
  if (/zeitung/.test(f)) return 'reading';
  if (/grammatik|redemittel/.test(f)) return 'grammar-reference';
  if (/ausbildung/.test(f)) return 'career';
  return 'coursebook';
}

export function titleOf(r) {
  return r.filename.replace(/\.[^.]+$/, '').replace(/^(Copy of )+\s*/, '').replace(/\s+/g, ' ').trim();
}
