/** The hero demo's element structure, shared by BOTH surfaces that render it:
 *  the landing page (site/src/components/HeroDemo.astro) and the app's welcome
 *  screen (src/components/welcome-hero.tsx). Astro and React can't share a
 *  component, but they can share this data — so the structure (how many lines,
 *  keycaps, bars) lives in one place and the two can never drift again.
 *
 *  Geometry, the animation timeline, and the rationale live in the sibling
 *  stylesheet src/assets/hero-demo.css (imported by both surfaces); this file
 *  is only the list of elements each surface iterates. Every class name here
 *  is a hook defined there. */

export interface HeroLine {
  /** CSS width, applied inline (e.g. "82%"). */
  width: string;
  /** The selection-highlight pass animation class, if this line gets swept. */
  sweep?: string;
}

/** The abstract "text" lines that get selected. */
export const HERO_LINES: readonly HeroLine[] = [
  { width: "100%" },
  { width: "82%", sweep: "hd-hla" },
  { width: "90%", sweep: "hd-hlb" },
  { width: "70%", sweep: "hd-hlc" },
  { width: "86%", sweep: "hd-hld" },
  { width: "60%" },
];

export interface HeroKeycap {
  /** The hd-k* animation class driving this cap's press/glow. */
  pulse: string;
  /** The visible key label. */
  label: string;
}

/** The chord: the modifier is held while C is tapped twice — ONE C key,
 *  pressed twice, not two keys. The modifier's label is filled in per surface
 *  (the landing passes "Ctrl/⌘" and swaps it client-side by OS; the app passes
 *  its already-resolved platform key). */
export function heroKeycaps(modifier: string): readonly HeroKeycap[] {
  return [
    { pulse: "hd-kmod", label: modifier },
    { pulse: "hd-kc", label: "C" },
  ];
}

/** The result popup's bars; each index maps to its hd-b{n} animation class. */
export const HERO_BARS: readonly string[] = ["92%", "74%"];
