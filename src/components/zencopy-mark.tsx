import type { SVGProps } from "react";

/**
 * The ZenCopy brand mark — the doubled ensō (open C, offset twice) that stands
 * for "copy twice". Renders in `currentColor`, following Lucide's icon rules, so
 * it inherits the surrounding text color. This is the only mark the UI should use.
 */
export function ZenCopyMark(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12.22 3.39A6.5 6.5 0 0 0 3.89 11.72" />
      <path d="M20.32 10.77A6.5 6.5 0 1 0 20.32 18.23" />
    </svg>
  );
}
