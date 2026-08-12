/** The screenshot scenario registry — pure data, importable from both the
 *  browser side (components, via src/lib/screenshot.ts) and the node side
 *  (scripts/screenshot.ts), so a scenario name exists in exactly one place.
 *  `params` are the URL parameters a shot loads screenshot.html with;
 *  `viewport` overrides the runner's settings-window default (logical px)
 *  for other windows. */

/** The `?screenshot=` value that opens the rule editor (prompts-settings). */
export const RULE_EDITOR_SCENARIO = "rule-editor";

export const SCREENSHOT_SCENARIOS: Record<
  string,
  { params: Record<string, string>; viewport?: { width: number; height: number } }
> = {
  welcome: { params: { welcome: "1" } },
  "new-rule": { params: { screenshot: RULE_EDITOR_SCENARIO } },
};
