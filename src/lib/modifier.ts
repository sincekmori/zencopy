/** The modifier key as a page spells it before it knows the visitor's OS:
 *  meta descriptions (read without JS by search engines and link previews),
 *  the landing copy and its animation until the head script has seen a Mac,
 *  the neutral screenshot and demo cuts. Windows and Linux press Ctrl, macOS
 *  ⌘, and a page that cannot tell says both. */
export const NEUTRAL_MODIFIER = "Ctrl/⌘";

/** A text-only place (a meta description) with the copy's `{mod}` spelled the
 *  neutral way — the landing copy and the docs' frontmatter write `{mod}`
 *  where the visitor's modifier goes, and this is what it becomes where no
 *  script can swap it. */
export function plainModifier(text: string): string {
  return text.replaceAll("{mod}", NEUTRAL_MODIFIER);
}
