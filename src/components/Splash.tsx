/** Opening screen: a short phrase types out while two people (● and ■) walk toward each other and meet. Respects reduced motion. */
export function Splash({ leaving }: { leaving?: boolean }) {
  return (
    <div className={`splash ${leaving ? 'splash-out' : ''}`} role="status" aria-live="polite" aria-label="Loading German Duo">
      <svg className="splash-art" viewBox="0 0 240 70" aria-hidden focusable="false">
        <line className="splash-line" x1="14" y1="40" x2="226" y2="40" />
        <circle className="splash-a" cx="14" cy="40" r="8" />
        <rect className="splash-b" x="218" y="32" width="16" height="16" rx="1" />
        <circle className="splash-spark" cx="120" cy="40" r="3" />
      </svg>
      <p className="splash-word"><span>Zusammen lernen.</span></p>
      <p className="splash-title">German Duo</p>
    </div>
  );
}
