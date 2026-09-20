import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LOCALE } from "./page-locale.ts";

/** A hand-taken capture of another product's screen (Windows, Google AI
 *  Studio) as a page shows it: the file under site/public/<locale>/screenshots/
 *  where the product speaks the page's language, else the default locale's —
 *  and its size, off the PNG, so the page lays the picture out before it
 *  loads and shows it as big as it is. Resolved at build, in the site
 *  directory astro runs in. */
export interface Capture {
  src: string;
  width: number;
  height: number;
}

export function captureOf(locale: string, name: string): Capture {
  for (const candidate of [locale, DEFAULT_LOCALE]) {
    const path = `/${candidate}/screenshots/${name}.png`;
    const file = join(process.cwd(), "public", path);
    if (existsSync(file)) {
      const { width, height } = pngSize(file);
      return { src: path, width, height };
    }
  }
  throw new Error(`no capture "${name}" under site/public for "${locale}" or "${DEFAULT_LOCALE}"`);
}

/** A PNG's pixel size, off its header (the IHDR chunk follows the signature). */
function pngSize(file: string): { width: number; height: number } {
  const head = Buffer.alloc(24);
  const fd = openSync(file, "r");
  try {
    readSync(fd, head, 0, head.length, 0);
  } finally {
    closeSync(fd);
  }
  if (head.toString("latin1", 1, 4) !== "PNG") {
    throw new Error(`${file} is not a PNG`);
  }
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}
