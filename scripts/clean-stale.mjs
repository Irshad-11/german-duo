// Runs automatically before `npm run build` (npm "prebuild"). If an older version of this project was copied over
// (so files that no longer exist in this version are still lying around), delete them so the build cannot break on them.
import { existsSync, rmSync } from 'node:fs';
const STALE = [
  'src/components/resource.tsx', 'src/components/ProgressDialog.tsx', 'src/hooks/useResourceActions.ts', 'src/lib/domain/stats.test.ts',
  'src/pages/DashboardPage.old.tsx', 'sql/old', 'supabase/functions', 'scripts/provision.mjs',
];
let n = 0;
for (const f of STALE) { if (existsSync(new URL(`../${f}`, import.meta.url))) { rmSync(new URL(`../${f}`, import.meta.url), { recursive: true, force: true }); console.log(`removed stale file: ${f}`); n++; } }
if (n === 0) console.log('no stale files');
