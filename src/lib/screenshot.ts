/** Dev-only: the screenshot scenario requested via `?screenshot=<name>`.
 *
 *  The screenshot harness (screenshot.html + scripts/screenshot.ts) renders
 *  the app in a plain browser and drives scenarios through the URL, so one
 *  dev server serves every scenario. Components opt in by checking the
 *  scenario name in a mount effect. Always undefined in production builds —
 *  the app's real windows carry no query string either way. */
export function screenshotScenario(): string | undefined {
  if (!import.meta.env.DEV) {
    return undefined;
  }
  return new URLSearchParams(globalThis.location.search).get("screenshot") ?? undefined;
}
