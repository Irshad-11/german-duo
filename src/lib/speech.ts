/** Reads text aloud with the device's own voice (no data leaves the device). Returns false when the browser has no speech support. */
export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;
export function speak(text: string, lang = 'de-DE'): boolean {
  if (!canSpeak() || !text.trim()) return false;
  const synth = window.speechSynthesis; synth.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = 0.9;
  const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())); if (v) u.voice = v;
  synth.speak(u); return true;
}
