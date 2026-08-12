/** The modal shell's shared skin — one string per part, so a backdrop or
 *  card tweak can never drift between ConfirmDialog and FormDialog (the
 *  field.ts pattern). Compose with cn() for per-dialog width and scroll.
 *  These sit at z-40/z-50 in the settings window; the popup window keeps its
 *  own lower ladder (z-10/z-20) — different windows, so the tiers never
 *  stack against each other. */
export const DIALOG_OVERLAY = "fixed inset-0 z-40 bg-background/50";
export const DIALOG_CARD =
  "fixed inset-x-0 top-1/2 z-50 mx-auto flex max-w-[calc(100vw-2rem)] -translate-y-1/2 flex-col gap-3 rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl";
export const DIALOG_TITLE = "text-sm font-semibold";
