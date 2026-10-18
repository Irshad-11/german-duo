import type { Mood } from './tips';

/** The companion. Pure SVG + CSS (no images). `level` adds a scarf (1), glasses (2) and a crown (3) as total shared study time grows. */
export function Fox({ mood, level = 0, size = 96, label }: { mood: Mood; level?: number; size?: number; label?: string }) {
  const happyEyes = mood === 'happy' || mood === 'cheer' || mood === 'proud' || mood === 'dance' || mood === 'love';
  const closed = mood === 'sleeping' || mood === 'sleepy';
  const open = !happyEyes && !closed;
  const mouth = mood === 'cheer' || mood === 'surprised' || mood === 'dance' ? 'open' : mood === 'sad' || mood === 'worried' ? 'frown' : mood === 'sleeping' || mood === 'thinking' || mood === 'reading' ? 'flat' : 'smile';
  const blush = mood === 'happy' || mood === 'love' || mood === 'proud' || mood === 'cheer';
  return (
    <svg className={`fox fox-${mood}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label ?? `Fuchsi the study fox looks ${mood}`} focusable="false">
      <g className="fx-all">
        <g className="fx-tail"><path d="M86 96 C112 96 120 70 104 54 C106 74 98 84 82 88Z" fill="var(--fox)" /><path d="M104 54 C108 60 109 66 108 71 C103 68 100 62 104 54Z" fill="#fff" /></g>
        <ellipse cx="60" cy="88" rx="26" ry="24" fill="var(--fox)" /><ellipse cx="60" cy="94" rx="14" ry="15" fill="#fff6e8" />
        {level >= 1 && <g><path d="M36 76 Q60 90 84 76 L85 84 Q60 98 35 84Z" fill="var(--scarf)" /><path d="M72 88 L78 106 L68 104Z" fill="var(--scarf)" /></g>}
        <ellipse className="fx-paw fx-paw-l" cx="48" cy="109" rx="8" ry="5" fill="var(--fox-dark)" />
        {mood === 'wave' ? <g className="fx-wave"><ellipse cx="82" cy="84" rx="6" ry="9" fill="var(--fox-dark)" /></g> : <ellipse className="fx-paw fx-paw-r" cx="72" cy="109" rx="8" ry="5" fill="var(--fox-dark)" />}
        <g className="fx-head">
          <g className="fx-ear fx-ear-l"><path d="M33 40 L28 8 L54 28Z" fill="var(--fox)" /><path d="M36 34 L33 17 L47 28Z" fill="#f2a2a0" /></g>
          <g className="fx-ear fx-ear-r"><path d="M87 40 L92 8 L66 28Z" fill="var(--fox)" /><path d="M84 34 L87 17 L73 28Z" fill="#f2a2a0" /></g>
          <ellipse cx="60" cy="54" rx="31" ry="27" fill="var(--fox)" />
          <path d="M29 60 Q41 84 60 82 Q79 84 91 60 Q77 70 60 70 Q43 70 29 60Z" fill="#fff6e8" />
          {blush && <g fill="#f08a8a" opacity=".55"><ellipse cx="38" cy="64" rx="5" ry="3" /><ellipse cx="82" cy="64" rx="5" ry="3" /></g>}
          {open && <g className="fx-eyes">
            <g className="fx-eye"><ellipse cx="46" cy="52" rx={mood === 'surprised' ? 6.5 : 4.5} ry={mood === 'surprised' ? 8 : 6} fill="#241a16" /><circle cx={mood === 'reading' ? 47 : 47.5} cy={mood === 'reading' ? 55 : 50} r="1.6" fill="#fff" /></g>
            <g className="fx-eye"><ellipse cx="74" cy="52" rx={mood === 'surprised' ? 6.5 : 4.5} ry={mood === 'surprised' ? 8 : 6} fill="#241a16" /><circle cx={mood === 'reading' ? 75 : 75.5} cy={mood === 'reading' ? 55 : 50} r="1.6" fill="#fff" /></g>
          </g>}
          {happyEyes && mood !== 'love' && <g fill="none" stroke="#241a16" strokeWidth="3" strokeLinecap="round"><path d="M40 54 Q46 46 52 54" /><path d="M68 54 Q74 46 80 54" /></g>}
          {mood === 'love' && <g fill="#e0455f"><path d="M46 58 C37 51 38 45 43 45 C45 45 46 47 46 48 C46 47 47 45 49 45 C54 45 55 51 46 58Z" /><path d="M74 58 C65 51 66 45 71 45 C73 45 74 47 74 48 C74 47 75 45 77 45 C82 45 83 51 74 58Z" /></g>}
          {closed && <g fill="none" stroke="#241a16" strokeWidth="3" strokeLinecap="round"><path d="M40 52 Q46 57 52 52" /><path d="M68 52 Q74 57 80 52" /></g>}
          {(mood === 'worried' || mood === 'sad') && <g stroke="#241a16" strokeWidth="2.4" strokeLinecap="round"><path d="M39 44 L53 39" /><path d="M81 44 L67 39" /></g>}
          {level >= 2 && <g fill="none" stroke="#3a2a22" strokeWidth="2"><circle cx="46" cy="52" r="9" /><circle cx="74" cy="52" r="9" /><path d="M55 52 H65" /></g>}
          <ellipse cx="60" cy="62" rx="4" ry="3" fill="#241a16" />
          {mouth === 'smile' && <path d="M52 67 Q60 75 68 67" fill="none" stroke="#241a16" strokeWidth="2.4" strokeLinecap="round" />}
          {mouth === 'open' && <path d="M52 67 Q60 82 68 67Z" fill="#7a2a2a" stroke="#241a16" strokeWidth="2" strokeLinejoin="round" />}
          {mouth === 'flat' && <path d="M54 69 H66" stroke="#241a16" strokeWidth="2.4" strokeLinecap="round" />}
          {mouth === 'frown' && <path d="M52 72 Q60 64 68 72" fill="none" stroke="#241a16" strokeWidth="2.4" strokeLinecap="round" />}
          {level >= 3 && <path d="M42 28 L46 14 L54 24 L60 10 L66 24 L74 14 L78 28Z" fill="#e8b520" stroke="#a37c0b" strokeWidth="1.5" strokeLinejoin="round" />}
        </g>
        {(mood === 'reading' || mood === 'thinking') && <g className="fx-book"><path d="M38 96 L60 100 L82 96 L82 112 L60 116 L38 112Z" fill="#fff" stroke="#3a2a22" strokeWidth="2" strokeLinejoin="round" /><path d="M60 100 V116" stroke="#3a2a22" strokeWidth="2" /></g>}
      </g>
      {mood === 'sleeping' && <g className="fx-z" fill="var(--ink)" fontFamily="serif" fontWeight="700"><text x="86" y="30" fontSize="14">z</text><text x="96" y="20" fontSize="11">z</text><text x="104" y="12" fontSize="9">z</text></g>}
      {mood === 'worried' && <path className="fx-drop" d="M92 40 Q97 48 92 52 Q87 48 92 40Z" fill="#5db4e8" />}
      {mood === 'sad' && <path className="fx-drop" d="M42 62 Q46 70 42 73 Q38 70 42 62Z" fill="#5db4e8" />}
      {mood === 'thinking' && <text className="fx-q" x="90" y="24" fontSize="22" fontFamily="serif" fontWeight="700" fill="var(--ink)">?</text>}
      {mood === 'surprised' && <text className="fx-q" x="92" y="26" fontSize="26" fontFamily="serif" fontWeight="700" fill="#d9482b">!</text>}
      {(mood === 'cheer' || mood === 'proud') && <g className="fx-spark" fill="#e8b520"><path d="M18 30 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" /><path d="M100 24 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /><path d="M14 70 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" /></g>}
      {mood === 'love' && <g className="fx-hearts" fill="#e0455f"><path d="M96 34 c-4 -3 -4 -7 -1 -7 1 0 1 1 1 1 0 0 0 -1 1 -1 3 0 3 4 -1 7z" /><path d="M20 40 c-4 -3 -4 -7 -1 -7 1 0 1 1 1 1 0 0 0 -1 1 -1 3 0 3 4 -1 7z" /></g>}
      {mood === 'dance' && <g className="fx-notes" fill="var(--ink)" fontFamily="serif"><text x="12" y="30" fontSize="18">♪</text><text x="98" y="22" fontSize="18">♫</text></g>}
    </svg>
  );
}
