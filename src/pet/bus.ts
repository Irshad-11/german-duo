export type PetEvent =
  | { kind: 'saved' } | { kind: 'studied'; minutes: number } | { kind: 'finished'; title: string } | { kind: 'error' } | { kind: 'undone' } | { kind: 'word' } | { kind: 'goal' } | { kind: 'say'; text: string };
const bus = new EventTarget();
/** Anything in the app can make the companion react without importing it. */
export function emitPet(e: PetEvent): void { bus.dispatchEvent(new CustomEvent('pet', { detail: e })); }
export function onPet(fn: (e: PetEvent) => void): () => void {
  const h = (ev: Event) => fn((ev as CustomEvent<PetEvent>).detail);
  bus.addEventListener('pet', h); return () => bus.removeEventListener('pet', h);
}
