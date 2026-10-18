import type { Mood } from './tips';

const BADGE: Partial<Record<Mood, string>> = { happy: '✓', cheer: '★', proud: '✓', love: '♥', sleeping: 'z', sleepy: '…', worried: '!', surprised: '!', thinking: '?', reading: '≡', dance: '♪' };
/** The study helper: one round orb with a simple face. Eyes follow the pointer (CSS vars --gx/--gy are set by the dock), mood changes eyes, mouth, colour and motion.
 *  `level` adds glowing rings as total study time grows. */
export function Orb({ mood, level = 0, size = 52, label }: { mood: Mood; level?: number; size?: number; label?: string }) {
  const badge = BADGE[mood];
  return (
    <span className={`orb orb-${mood} orb-l${level}`} style={{ width: size, height: size, fontSize: size }} role="img" aria-label={label ?? `Study helper, feeling ${mood}`}>
      {level >= 1 && <i className="orb-ring orb-r1" />}{level >= 2 && <i className="orb-ring orb-r2" />}{level >= 3 && <i className="orb-ring orb-r3" />}
      <span className="orb-core">
        <i className="orb-glint" />
        <span className="orb-eye orb-eye-l"><i className="orb-pupil" /></span><span className="orb-eye orb-eye-r"><i className="orb-pupil" /></span>
        <i className="orb-brow orb-brow-l" /><i className="orb-brow orb-brow-r" /><i className="orb-cheek orb-cheek-l" /><i className="orb-cheek orb-cheek-r" />
        <i className="orb-mouth" /><i className="orb-tear" />
      </span>
      {badge && <b className="orb-badge" aria-hidden>{badge}</b>}
      <i className="orb-p orb-p1" /><i className="orb-p orb-p2" /><i className="orb-p orb-p3" />
    </span>
  );
}
