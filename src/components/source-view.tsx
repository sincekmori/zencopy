import { ChevronDown, ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { Markdown } from "@/components/markdown.tsx";
import type { Source } from "@/lib/capture.ts";
import { useT } from "@/lib/i18n.tsx";
import { cn } from "@/lib/utils.ts";

interface Props {
  source: Source;
  /** The copy as the model reads it — the capture's `text` variable: a
   *  formatted copy's HTML already turned into Markdown by Rust. */
  text: string | undefined;
}

const COPY_TEXT = "leading-relaxed wrap-break-word whitespace-pre-wrap";
// The glance is deliberately small from the first frame: the default prompt
// starts with the capture, so a "shrink once the result arrives" state never
// really shows — its whole job is a quick "yes, that's what I copied".
const GLANCE_TEXT = `${COPY_TEXT} line-clamp-2 text-xs text-foreground/80`;
// Opened, the copy reads at the reply's size in a pane of its own, capped so
// the result below stays within reach however long the copy is.
const READ_PANE = "max-h-[40svh] overflow-auto";
const READ_TEXT = `${COPY_TEXT} text-sm`;

/** The copy's words: a formatted copy's own plain flavor (the Markdown when
 *  the clipboard carried none — Rust falls back the same way), a file copy's
 *  paths, nothing for an image. */
function copyText(source: Source, text: string | undefined): string {
  switch (source.kind) {
    case "text": {
      return source.text;
    }
    case "rich_text": {
      return source.plain || text || "";
    }
    case "files": {
      return source.paths.join("\n");
    }
    case "image": {
      return "";
    }
  }
}

/** Two lines of words: the blank lines and surrounding whitespace a copy from
 *  a page or a mail often opens with would spend the glance on nothing — and
 *  no more than the opening of a copy, which is all two clamped lines can
 *  show and all a screen reader should hear as the toggle's name. */
function glanceText(text: string): string {
  const start = text.search(/\S/u);
  if (start === -1) {
    return "";
  }
  return text
    .slice(start, start + 600)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** The copy in two lines (an image: a thumbnail) — the words of a formatted
 *  copy, never its markup: a web page's HTML in a sandbox showed a 48 px
 *  sliver that looked like a scroll pane and could not scroll. */
function Glance({ source, text }: Props): React.JSX.Element {
  const t = useT();
  if (source.kind === "image") {
    // A touch taller than text: the attachment confirmation leans on this
    // preview to show what would be sent.
    return (
      <img
        src={source.data_url}
        alt={t.source.imageAlt}
        className="mx-auto max-h-24 w-auto rounded object-contain"
      />
    );
  }
  return (
    <span className={GLANCE_TEXT}>
      {glanceText(copyText(source, text)) || t.source.cannotPreview}
    </span>
  );
}

/** The whole copy, to read: a formatted copy as the Markdown the model is
 *  given, rendered like a reply — with no image allowed to load (a mail's
 *  tracking pixel included: `source` is withheld on purpose) and links that
 *  ask before opening, as everywhere in the popup. */
function Reading({ source, text }: Props): React.JSX.Element {
  const t = useT();
  if (source.kind === "image") {
    return (
      <img
        src={source.data_url}
        alt={t.source.imageAlt}
        className="mx-auto max-h-[40svh] w-auto rounded object-contain"
      />
    );
  }
  if (source.kind === "files") {
    return (
      <ul className="space-y-0.5 text-sm break-all">
        {source.paths.map((path) => (
          <li key={path}>{path}</li>
        ))}
      </ul>
    );
  }
  if (source.kind === "rich_text" && source.format === "html" && text) {
    return <Markdown text={text} source={undefined} />;
  }
  return <p className={READ_TEXT}>{copyText(source, text) || t.source.cannotPreview}</p>;
}

/** The copied content, framed as a quotation so it reads as the input a
 *  prompt runs against — not as output. A left rule + a quiet eyebrow ("copied
 *  content") remove the first-run "is this the result?" ambiguity without
 *  clutter. The frame is a disclosure: closed, the two-line glance; a press
 *  anywhere on it opens the whole copy to read and scroll. */
export function SourceView({ source, text }: Props): React.JSX.Element {
  const t = useT();
  // The capture the box is open for: a new one — a re-copy of the same words
  // included — arrives closed, glance first. React holds the attribute so that
  // reset reaches the DOM; the native toggle feeds the user's presses back.
  const [openFor, setOpenFor] = useState<Source | undefined>(undefined);
  const open = openFor === source;
  return (
    <details
      open={open}
      onToggle={(event) => {
        setOpenFor(event.currentTarget.open ? source : undefined);
      }}
      className="rounded-lg border-s-2 border-border bg-muted/40 px-2.5 py-2"
    >
      <summary className="cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
        <span className="mbe-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70 uppercase">
          <ClipboardCheck className="size-3" />
          <span className="tracking-wide">{t.source.inputLabel}</span>
          <ChevronDown
            className={cn("ms-auto size-3 transition-transform", open && "rotate-180")}
          />
        </span>
        {open ? undefined : <Glance source={source} text={text} />}
      </summary>
      {open ? (
        <div className={READ_PANE}>
          <Reading source={source} text={text} />
        </div>
      ) : undefined}
    </details>
  );
}
