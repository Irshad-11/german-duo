import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { LogSessionDialog, QuickNoteDialog, WordDialog } from '@/components/dialogs';
import type { NoteKind } from '@/types/db';

type Kind = 'word' | 'note' | 'session' | null;
interface QuickApi { openWord: (seed?: string) => void; openNote: (kind?: NoteKind) => void; openSession: () => void }
const Ctx = createContext<QuickApi | null>(null);

/** Global quick-capture dialogs (reachable from the + button on every page). */
export function QuickProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Kind>(null);
  const [seed, setSeed] = useState<string | undefined>();
  const [noteKind, setNoteKind] = useState<NoteKind>('note');
  const api = useMemo<QuickApi>(() => ({
    openWord: (s) => { setSeed(s); setOpen('word'); }, openNote: (k = 'note') => { setNoteKind(k); setOpen('note'); }, openSession: () => setOpen('session'),
  }), []);
  const close = () => setOpen(null);
  return (
    <Ctx.Provider value={api}>
      {children}
      <WordDialog open={open === 'word'} word={null} seed={seed} onClose={close} />
      <QuickNoteDialog open={open === 'note'} kind={noteKind} onClose={close} />
      <LogSessionDialog open={open === 'session'} onClose={close} />
    </Ctx.Provider>
  );
}
export function useQuick(): QuickApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useQuick must be used inside <QuickProvider>');
  return c;
}
