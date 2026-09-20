/** The glyphs the docs draw as the app draws them: Lucide's own data, from
 *  the very package the popup renders its icons with — so an icon in the
 *  guide is the icon on the screen, by construction. Each is the `<svg>`'s
 *  children (tag and attributes) on Lucide's grid; the svg's own attributes
 *  are Lucide's defaults (a round-capped 2-unit stroke in currentColor, no
 *  fill), which site/src/components/Icon.astro sets. */
// @ts-expect-error: lucide-react types its components, not the per-icon data modules; IconData pins the shape.
import { __iconData as settings } from "lucide-react/dist/esm/icons/settings.mjs";
import type { Messages } from "./messages/index.ts";

interface IconData {
  /** The grid the glyph is drawn on (24 for Lucide). */
  size: number;
  /** The svg's children: a tag and its attributes, React's `key` dropped. */
  node: [tag: string, attrs: Record<string, string>][];
}

/** A glyph the docs draw, with the name the app gives the control it sits
 *  on — its own accessible label, in the reader's language — so a screen
 *  reader hears what a sighted reader sees, and the prose need not repeat
 *  the name beside the picture. */
interface Icon extends IconData {
  label: (messages: Messages) => string;
}

function glyph(data: { size: number; node: [string, Record<string, string>][] }): IconData {
  return {
    size: data.size,
    node: data.node.map(([tag, attrs]) => [
      tag,
      Object.fromEntries(Object.entries(attrs).filter(([name]) => name !== "key")),
    ]),
  };
}

/** By the name the docs use: the popup's settings button. */
export const ICONS: Record<"settings", Icon> = {
  settings: { ...glyph(settings), label: (messages) => messages.popup.openSettings },
};
