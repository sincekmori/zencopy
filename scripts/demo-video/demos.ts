// The demo videos, as one session: the popup is put through every demo in
// turn, each picking up where the previous left off — the summary the first
// demo ends on is the screen the second one opens with, and so on — while
// the frames are captured continuously and cut into one video per demo.
// Everything is mechanical except the model's answers, which are real when
// recorded and replayed from the recording after that.

/** One step of a demo. `type` names a per-locale string from
 *  POPUP_RESULT_FIXTURES (src/lib/screenshot-scenarios.ts). */
type Step =
  /** Deliver the capture (the C+C) — the recording's t=0. */
  | { kind: "capture" }
  /** Wait for the current prompt's reply to finish (spinner → check). */
  | { kind: "settled" }
  /** Press a digit, as the user would, to switch quick slots; waits for the
   *  switch to take (a run starting, or Custom's composer taking focus). */
  | { kind: "slot"; key: "1" | "2" | "3" | "4" | "5" }
  /** A bare key press: Enter sends the composer, Escape steps out of it. */
  | { kind: "press"; key: "Enter" | "Escape" }
  /** Type a per-locale string into the composer, one key at a time —
   *  clicking into it first when it is not already focused. */
  | { kind: "type"; text: "instruction" | "concise" }
  /** Let the viewer read. */
  | { kind: "hold"; seconds: number };

export interface Demo {
  /** The video's file name (`<locale>/demo/<name>.mp4`). */
  name: string;
  /** What the popup plays over: the rendered mail page (the copy and its
   *  answer side by side, landscape) or nothing — the popup's own window
   *  alone, over a plain backdrop. */
  stage: "page" | "popup";
  steps: Step[];
}

/** The frame each stage is filmed in, in CSS px — the videos are
 *  VIDEO_SCALE× that. The popup's is its window: the generator checks it
 *  against the popup scenario's viewport (src/lib/screenshot-scenarios.ts),
 *  and DemoVideo.astro sizes its <video> from here. */
export const FRAMES = {
  page: { width: 1100, height: 720 },
  popup: { width: 615, height: 620 },
} as const;
/** The device pixel ratio the frames are captured at. */
export const VIDEO_SCALE = 2;

const READ = { kind: "hold", seconds: 2.5 } as const;
/** The first demo's closing hold: the summary and its last caption (see
 *  captions.ts) are read together. */
const READ_CAPTIONED = { kind: "hold", seconds: 3.5 } as const;
const LOOK = { kind: "hold", seconds: 1 } as const;
const BEAT = { kind: "hold", seconds: 0.4 } as const;

/** In session order. */
export const DEMOS: Demo[] = [
  // Copy twice, the summary streams in, a beat to read it.
  {
    name: "summarize",
    stage: "page",
    steps: [{ kind: "capture" }, { kind: "settled" }, READ_CAPTIONED],
  },
  // 2 switches to Explain over the same copy; the explanation streams in.
  {
    name: "explain",
    stage: "popup",
    steps: [LOOK, { kind: "slot", key: "2" }, { kind: "settled" }, READ],
  },
  // A reply typed under the explanation continues the thread: shorter, please.
  {
    name: "follow-up",
    stage: "popup",
    steps: [
      LOOK,
      { kind: "type", text: "concise" },
      BEAT,
      { kind: "press", key: "Enter" },
      { kind: "settled" },
      READ,
    ],
  },
  // Esc leaves the composer, 5 opens the Custom slot, the user types what
  // they want, the answer streams in.
  {
    name: "custom",
    stage: "popup",
    steps: [
      LOOK,
      { kind: "press", key: "Escape" },
      { kind: "slot", key: "5" },
      BEAT,
      { kind: "type", text: "instruction" },
      BEAT,
      { kind: "press", key: "Enter" },
      { kind: "settled" },
      READ,
    ],
  },
];
