// Lint for what oxlint cannot parse: .astro components. Policy: every rule on
// as an error ("flat/all" + strict a11y); conflicts get resolved toward the
// elegant side, case by case. TypeScript in frontmatter and the lone .ts file
// are oxlint's job (run from the repo root) — eslint only looks at .astro.
import tsParser from "@typescript-eslint/parser";
import { configs } from "eslint-plugin-astro";

const config = [
  { ignores: ["dist/", "node_modules/", ".astro/"] },
  ...configs["flat/all"],
  ...configs["flat/jsx-a11y-strict"],
  {
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: { parser: tsParser },
    },
  },
  {
    // The landing ships no JS bundle by design, and two of its scripts must
    // run before first paint (theme restore, locale redirect) — inline is the
    // correct form there, not an accident. The rule stays on everywhere else.
    files: ["src/pages/index.astro", "src/components/Landing.astro"],
    rules: {
      "astro/no-unsafe-inline-scripts": "off",
    },
  },
  {
    // The architecture diagram is an SVG string computed by our own pure
    // function from label props it XML-escapes — no user or remote input ever
    // reaches it, so set:html is the intended form here, not an injection
    // risk. The rule stays on everywhere else.
    files: ["src/components/ArchitectureDiagram.astro"],
    rules: {
      "astro/no-set-html-directive": "off",
    },
  },
];

export default config;
