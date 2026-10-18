/** Opening screen: two circles (the two learners) glide together and become one glowing orb — the study helper. Respects reduced motion. */
export function Splash({ leaving }: { leaving?: boolean }) {
  return (
    <div className={`splash ${leaving ? 'splash-out' : ''}`} role="status" aria-live="polite" aria-label="Loading German Duo">
      <svg className="splash-art" viewBox="0 0 240 90" aria-hidden focusable="false">
        <defs><radialGradient id="sg" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset=".35" stopColor="#4fb98c" /><stop offset="1" stopColor="#1f6b50" /></radialGradient></defs>
        <line className="splash-line" x1="20" y1="45" x2="220" y2="45" />
        <circle className="splash-a" cx="20" cy="45" r="11" /><circle className="splash-b" cx="220" cy="45" r="11" />
        <circle className="splash-ring" cx="120" cy="45" r="14" /><circle className="splash-orb" cx="120" cy="45" r="15" fill="url(#sg)" />
      </svg>
      <p className="splash-title">German Duo</p>
      <p className="splash-word">Zusammen lernen — learning together</p>
    </div>
  );
}
