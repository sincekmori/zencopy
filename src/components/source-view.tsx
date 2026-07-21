import { ClipboardCheck } from "lucide-react";
import type { Source } from "@/lib/capture.ts";
import { useT } from "@/lib/i18n.tsx";
import { useDarkScheme } from "@/lib/theme.ts";

// Deliberately small from the first frame: the default action starts with the
// capture, so a "shrink once the result arrives" state never really shows —
// the source's whole job is a quick "yes, that's what I copied" glance.
const TEXT_CLASS =
  "line-clamp-2 text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground/80";

function Body({ source }: { source: Source }): React.JSX.Element {
  const t = useT();
  // Subscribed (not read off the DOM during render), so a theme switch while
  // a rich-text capture is on screen re-renders the iframe in the new scheme.
  const dark = useDarkScheme();
  switch (source.kind) {
    case "text": {
      return <p className={TEXT_CLASS}>{source.text}</p>;
    }
    case "rich_text": {
      // RTF can't render in a webview, so fall back to its plain text.
      if (source.format !== "html") {
        return <p className={TEXT_CLASS}>{source.plain || t.source.cannotPreview}</p>;
      }
      // Render HTML in a script-less sandbox. Match the app's light/dark scheme and
      // keep the background transparent so it never shows as a white block.
      const doc = `<!doctype html><meta name="color-scheme" content="${dark ? "dark" : "light"}"><style>html,body{margin:0;background:transparent}body{padding:2px 4px;font:12px/1.6 system-ui,-apple-system,sans-serif}img{max-width:100%}</style>${source.markup}`;
      return (
        <iframe
          sandbox=""
          srcDoc={doc}
          title={t.source.richText}
          className="h-12 w-full rounded border-0 bg-transparent"
        />
      );
    }
    case "image": {
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
    case "files": {
      return (
        <ul className="max-h-10 space-y-0.5 overflow-auto text-xs text-foreground/80">
          {source.paths.map((path) => (
            <li key={path} className="truncate" title={path}>
              {path}
            </li>
          ))}
        </ul>
      );
    }
    case "empty": {
      return <p className="text-xs text-muted-foreground">{t.source.emptyClipboard}</p>;
    }
  }
}

/** The copied content, framed as a quotation so it reads as the input an
 *  action runs against — not as output. A left rule + a quiet eyebrow ("copied
 *  content") remove the first-run "is this the result?" ambiguity without
 *  clutter. */
export function SourceView({ source }: { source: Source }): React.JSX.Element {
  const t = useT();
  return (
    <div className="rounded-lg border-s-2 border-border bg-muted/40 px-2.5 py-2">
      {source.kind === "empty" ? undefined : (
        <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70 uppercase">
          <ClipboardCheck className="size-3" />
          <span className="tracking-wide">{t.source.inputLabel}</span>
        </div>
      )}
      <Body source={source} />
    </div>
  );
}
