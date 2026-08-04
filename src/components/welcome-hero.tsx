// The welcome screen's looping hero animation. Its element structure is shared
// with the landing page via @/lib/hero-demo (so the two never drift); geometry
// and timeline live in the shared stylesheet (src/assets/hero-demo.css). This
// shell only maps the app's theme tokens onto the palette hooks and pins the
// design unit to 1px (the popup window never needs it to scale).
import "@/assets/hero-demo.css";
import { HERO_BARS, HERO_LINES, heroKeycaps } from "@/lib/hero-demo.ts";

// Precomputed at module scope so the render creates no new objects — the lists
// are constant, so the width styles and bar classes never change.
const LINES = HERO_LINES.map((line) => ({
  sweep: line.sweep,
  width: line.width,
  style: { width: line.width },
}));
const BARS = HERO_BARS.map((width, i) => ({ width, style: { width }, cls: `hd-bar hd-b${i + 1}` }));

export function WelcomeHero({ modifier }: { modifier: string }): React.JSX.Element {
  return (
    <div className="mx-auto h-45 w-full max-w-[320px] [--hd-accent:var(--primary)] [--hd-border:var(--border)] [--hd-surface:var(--popover)] [--hd-text:var(--muted-foreground)] [--hd-track:var(--muted)] [--u:1px]">
      <div className="hd-canvas">
        <div className="hd-lines">
          {LINES.map((line) => (
            <div key={line.width} className="hd-line" style={line.style}>
              {line.sweep ? <div className={`hd-sweep ${line.sweep}`} /> : undefined}
            </div>
          ))}
          <span className="hd-cursor" />
        </div>
        <div className="hd-keys">
          {heroKeycaps(modifier).map((cap) => (
            <span key={cap.pulse} className={`hd-keycap ${cap.pulse}`}>
              <span className="hd-glow" />
              <span className="hd-label">{cap.label}</span>
            </span>
          ))}
        </div>
        <div className="hd-pop">
          <div className="hd-bars">
            {BARS.map((bar) => (
              <div key={bar.width} className={bar.cls} style={bar.style} />
            ))}
          </div>
          <div className="hd-check">
            <span className="hd-tick-a" />
            <span className="hd-tick-b" />
          </div>
        </div>
      </div>
    </div>
  );
}
