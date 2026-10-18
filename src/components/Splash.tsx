export function Splash({ label = 'Loading German Duo' }: { label?: string }) {
  return (
    <div className="splash" role="status" aria-live="polite" aria-label={label}>
      <svg className="splash-art" viewBox="0 0 220 120" aria-hidden focusable="false">
        <path className="splash-arc" d="M24 96 C 24 28, 196 28, 196 96" />
        <circle className="splash-dot splash-dot-a" r="9" cx="24" cy="96" />
        <circle className="splash-dot splash-dot-b" r="9" cx="196" cy="96" />
        <text className="splash-word" x="110" y="86" textAnchor="middle">Hallo</text>
      </svg>
      <p className="splash-title">German Duo</p>
      <p className="splash-sub">Zusammen lernen · learning together</p>
    </div>
  );
}
