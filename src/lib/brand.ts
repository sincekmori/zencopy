/**
 * The ZenCopy brand mark, drawn once.
 *
 * The mark is the doubled ensō — an open C, offset twice, for "copy twice" —
 * on Lucide's 24-unit grid. The name beside it is always plain text in the
 * surrounding font, never outlines; only the mark is geometry, and every
 * rendering of it is a function of this module, made when it is built, so
 * no brand file is committed: the app's React mark
 * (components/zencopy-mark.tsx), the site's inline SVGs (both headers, the
 * landing hero, the architecture diagram), the files the site builds
 * (site/src/pages: the favicon, the touch icon, the share card), the app
 * icon set and tray glyph `bun run icons` renders into src-tauri/icons/
 * (scripts/icons.ts), and the dev server's tab icon (vite.config.ts). What
 * differs between them — color, stroke, placement, a pathLength for a draw
 * animation — is a parameter here; the geometry is not.
 */

/** Lucide's grid: the mark is drawn in a 24-unit square. */
export const MARK_GRID = 24;

/** The two arcs, in grid units. */
export const MARK_PATHS = [
  "M12.22 3.39A6.5 6.5 0 0 0 3.89 11.72",
  "M20.32 10.77A6.5 6.5 0 1 0 20.32 18.23",
] as const;

/** How the arcs are stroked (Lucide's rules), as React SVG props — the string
 *  renderers below write the same values as attributes. */
export const MARK_STROKE = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** The brand ink: the ground of the icon and the share card. */
export const INK = "#18181B";
/** Slate-100: the mark and the name on the share card's ink. */
export const SLATE = "#F1F5F9";
const WHITE = "#FFFFFF";

const ICON_GRID = 512;

type Attrs = Record<string, string | number | undefined>;

const escapeAttr = (value: string | number): string =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

/** ` name="value"` for each defined entry, in the object's order. */
const attrsOf = (attrs: Attrs): string =>
  Object.entries(attrs)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join("");

const indent = (block: string): string =>
  block
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

export interface MarkOptions {
  /** Stroke color; `currentColor` (the default) inherits the surrounding text color. */
  color?: string | undefined;
  strokeWidth?: number | undefined;
  /** An SVG transform placing the 24-unit mark in the caller's coordinates. */
  transform?: string | undefined;
  /** Sets `pathLength` on each arc so a stylesheet can draw them in
   *  (`stroke-dasharray` and `stroke-dashoffset` in units of it). */
  pathLength?: number | undefined;
}

/** The mark as a `<g class="zc-mark">` in grid units, stroke rules included —
 *  a caller only places and colors it. */
export function markGroup({
  color = "currentColor",
  strokeWidth = MARK_STROKE.strokeWidth,
  transform,
  pathLength,
}: MarkOptions = {}): string {
  const group = attrsOf({
    class: "zc-mark",
    transform,
    fill: MARK_STROKE.fill,
    stroke: color,
    "stroke-width": strokeWidth,
    "stroke-linecap": MARK_STROKE.strokeLinecap,
    "stroke-linejoin": MARK_STROKE.strokeLinejoin,
  });
  const paths = MARK_PATHS.map((d) => `  <path${attrsOf({ d, pathLength })}/>`).join("\n");
  return `<g${group}>\n${paths}\n</g>`;
}

export interface SvgOptions {
  /** Attributes for the root element (class, role, aria-*). */
  attrs?: Attrs | undefined;
  /** An accessible name as `<title>` — for a file; inline, prefer `aria-label`
   *  in `attrs`, since a title is also a tooltip. */
  title?: string | undefined;
}

/** A standalone `<svg>` of the given box, sized to it, around `body`. */
function svg(
  box: { width: number; height: number },
  { attrs = {}, title }: SvgOptions,
  body: string,
): string {
  const root = attrsOf({
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: `0 0 ${box.width} ${box.height}`,
    width: box.width,
    height: box.height,
    ...attrs,
  });
  const named = title === undefined ? "" : `  <title>${escapeAttr(title)}</title>\n`;
  return `<svg${root}>\n${named}${indent(body)}\n</svg>`;
}

/** The mark alone, in its 24-unit box. */
export function markSvg({ attrs, title, ...mark }: MarkOptions & SvgOptions = {}): string {
  return svg({ width: MARK_GRID, height: MARK_GRID }, { attrs, title }, markGroup(mark));
}

/** The app icon: the mark in white on an ink rounded square — what
 *  `tauri icon` rasterizes, the site's favicon, the touch icon. */
export function iconSvg(): string {
  const ground = `<rect width="${ICON_GRID}" height="${ICON_GRID}" rx="114" fill="${INK}"/>`;
  const mark = markGroup({ color: WHITE, transform: "translate(29 28) scale(19)" });
  return svg(
    { width: ICON_GRID, height: ICON_GRID },
    { attrs: { role: "img", "aria-label": "ZenCopy app icon" }, title: "ZenCopy" },
    `${ground}\n${mark}`,
  );
}

/** The tray glyph: the mark alone in white on nothing (macOS re-tints it as a
 *  template image; the menu bar and the taskbar show it small). */
export function traySvg(): string {
  return svg(
    { width: ICON_GRID, height: ICON_GRID },
    { attrs: { role: "img", "aria-label": "ZenCopy tray icon" }, title: "ZenCopy" },
    markGroup({ color: WHITE, transform: "translate(41 40) scale(18)" }),
  );
}
