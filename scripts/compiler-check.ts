// The React Compiler leaves out, without a word, any component or hook it
// cannot lower — a `try … finally`, a conditional inside a `try` block, a
// dynamic `import()` — and the app then runs it unmemoized, while the repo
// writes no `useMemo` / `useCallback` on the promise that the compiler does
// that work. This holds the build to the promise: every source under src/
// goes through the compiler as the build runs it (vite.config.ts), and a
// function it gives up on fails the lint, named with the line and the reason.
//
// Usage: bun scripts/compiler-check.ts   (part of `bun run lint`)
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { transformAsync } from "@babel/core";
import type { Logger, LoggerEvent } from "babel-plugin-react-compiler";

const ROOT = join(import.meta.dirname, "..");

/** A function the compiler did not compile: where, and why. */
interface Skipped {
  line: number | undefined;
  reason: string;
}

/** What an event of the compiler's says it gave up on, if it says so. */
function skippedBy(event: LoggerEvent): Skipped | undefined {
  const line = "fnLoc" in event ? event.fnLoc?.start.line : undefined;
  switch (event.kind) {
    case "CompileError": {
      const at = event.detail.primaryLocation();
      return {
        line: typeof at === "object" ? (at?.start.line ?? line) : line,
        reason: event.detail.reason,
      };
    }
    case "CompileSkip": {
      return { line: event.loc?.start.line ?? line, reason: event.reason };
    }
    case "PipelineError": {
      return { line, reason: event.data };
    }
    default: {
      return undefined;
    }
  }
}

/** One source through the compiler: how many functions it compiled, and what
 *  it skipped, each as a line of the report. */
async function compile(file: string): Promise<{ compiled: number; skipped: string[] }> {
  let compiled = 0;
  const skipped: string[] = [];
  const logger: Logger = {
    logEvent: (_filename, event) => {
      if (event.kind === "CompileSuccess") {
        compiled += 1;
      }
      const given = skippedBy(event);
      if (given !== undefined) {
        skipped.push(`${file}:${given.line ?? "?"} — ${given.reason}`);
      }
    },
  };
  await transformAsync(readFileSync(join(ROOT, file), "utf8"), {
    filename: file,
    babelrc: false,
    configFile: false,
    code: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [["babel-plugin-react-compiler", { logger }]],
  });
  return { compiled, skipped };
}

const files = globSync("src/**/*.{ts,tsx}", { cwd: ROOT }).toSorted();
const results = await Promise.all(files.map((file) => compile(file)));
const compiled = results.reduce((sum, result) => sum + result.compiled, 0);
const skipped = results.flatMap((result) => result.skipped);
if (skipped.length > 0) {
  console.error(skipped.join("\n"));
  console.error(
    `\nThe React Compiler gave up at the ${skipped.length} place(s) above; the components and hooks they are in now run unmemoized — see "React" in AGENTS.md for what it cannot compile and how to write around it.`,
  );
  process.exit(1);
}
console.log(`React Compiler: ${compiled} components and hooks compiled, none skipped.`);
