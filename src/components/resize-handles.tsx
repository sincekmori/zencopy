import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { createLogger } from "@/lib/log.ts";
import { IS_MAC } from "@/lib/platform.ts";
import { cn } from "@/lib/utils.ts";

const log = createLogger("resize-handles");

/** The API keeps the direction union to itself; this is that parameter's type. */
type ResizeDirection = Parameters<Window["startResizeDragging"]>[0];

/**
 * The popup's resize handles on Linux and Windows: eight invisible strips
 * along the card's visible edge that start a native resize drag.
 *
 * The popup is an undecorated window whose card floats inside a transparent
 * margin (popup.tsx's `max-compact:p-2`). What the platforms offer for
 * resizing such a window is a zone at the *window's* edge: on Linux the
 * runtime's outer 5 logical px per scale, on Windows the system frame width
 * — both lie in the margin, out of reach of a pointer aimed at the edge the
 * user can see, so the popup read as unresizable there. These strips sit just
 * inside that zone (never over it, so a press is claimed once) and cover the
 * card's edge. macOS resizes a borderless window at its edges on its own, and
 * Tauri's resize drag is not supported there, so nothing renders.
 */
const THICKNESS = 6;
const CORNER = 14;
/** The window edge the runtime already claims, in CSS px. */
const BAND = 5 * Math.max(1, Math.round(globalThis.devicePixelRatio));

interface Handle {
  direction: ResizeDirection;
  className: string;
  style: React.CSSProperties;
}

const HANDLES: Handle[] = [
  {
    direction: "North",
    className: "cursor-ns-resize",
    style: { top: BAND, left: BAND + CORNER, right: BAND + CORNER, height: THICKNESS },
  },
  {
    direction: "South",
    className: "cursor-ns-resize",
    style: { bottom: BAND, left: BAND + CORNER, right: BAND + CORNER, height: THICKNESS },
  },
  {
    direction: "West",
    className: "cursor-ew-resize",
    style: { left: BAND, top: BAND + CORNER, bottom: BAND + CORNER, width: THICKNESS },
  },
  {
    direction: "East",
    className: "cursor-ew-resize",
    style: { right: BAND, top: BAND + CORNER, bottom: BAND + CORNER, width: THICKNESS },
  },
  {
    direction: "NorthWest",
    className: "cursor-nwse-resize",
    style: { top: BAND, left: BAND, width: CORNER, height: CORNER },
  },
  {
    direction: "NorthEast",
    className: "cursor-nesw-resize",
    style: { top: BAND, right: BAND, width: CORNER, height: CORNER },
  },
  {
    direction: "SouthWest",
    className: "cursor-nesw-resize",
    style: { bottom: BAND, left: BAND, width: CORNER, height: CORNER },
  },
  {
    direction: "SouthEast",
    className: "cursor-nwse-resize",
    style: { bottom: BAND, right: BAND, width: CORNER, height: CORNER },
  },
];

async function startResize(direction: ResizeDirection, event: React.PointerEvent): Promise<void> {
  if (event.button !== 0) {
    return;
  }
  event.preventDefault();
  try {
    await getCurrentWindow().startResizeDragging(direction);
  } catch (error) {
    log.error(`resize drag (${direction})`, error);
  }
}

export function ResizeHandles(): React.JSX.Element | undefined {
  if (IS_MAC) {
    return undefined;
  }
  return (
    <>
      {HANDLES.map((handle) => (
        <div
          key={handle.direction}
          aria-hidden="true"
          role="presentation"
          className={cn("fixed z-50 touch-none", handle.className)}
          style={handle.style}
          onPointerDown={(event) => {
            void startResize(handle.direction, event);
          }}
        />
      ))}
    </>
  );
}
