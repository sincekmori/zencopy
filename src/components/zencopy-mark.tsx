import type { SVGProps } from "react";
import { MARK_GRID, MARK_PATHS, MARK_STROKE } from "@/lib/brand.ts";

/**
 * The ZenCopy brand mark — the doubled ensō (open C, offset twice) that stands
 * for "copy twice" — as a React element: the geometry and the stroke rules
 * come from lib/brand.ts, where the brand is drawn once. Renders in
 * `currentColor`, following Lucide's icon rules, so it inherits the
 * surrounding text color. This is the only mark the UI should use.
 */
export function ZenCopyMark(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={MARK_GRID}
      height={MARK_GRID}
      viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`}
      stroke="currentColor"
      {...MARK_STROKE}
      aria-hidden="true"
      {...props}
    >
      {MARK_PATHS.map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}
