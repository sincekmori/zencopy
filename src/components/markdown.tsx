import { invoke } from "@tauri-apps/api/core";
import { createContext, useContext, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button.tsx";
import { useT } from "@/lib/i18n.tsx";

// remark-breaks keeps single newlines as line breaks (chat-style, like GitHub
// comments) — without it a translated poem or list would collapse into one
// paragraph.
const remarkPlugins = [remarkGfm, remarkBreaks];

// Context, not a prop drilled through react-markdown's `components` — that
// map must stay a stable module-level object (see SourceContext below).
const LinkConfirmContext = createContext<(href: string) => void>(() => undefined);

function suppress(event: React.SyntheticEvent): void {
  event.preventDefault();
}

/** Anchors in model output: never navigate the popup webview. A click asks
 *  first, showing the real URL — link text in model output can lie, and a
 *  clicked URL's query string is an exfiltration channel for the captured
 *  content. Confirmed links go to the system browser via `open_url`, which
 *  opens https and nothing else — so a link of another kind (`http://`, the
 *  `mailto:` remark-gfm makes of a bare address) is left as its text rather
 *  than offered as a button that does nothing. The webview's own ways of
 *  following a link, which bypass the click (the context menu's Open Link, a
 *  middle click), are switched off; the navigation guard in windows.rs is
 *  the backstop. */
function SystemBrowserLink({ href, children }: React.ComponentProps<"a">): React.JSX.Element {
  const requestOpen = useContext(LinkConfirmContext);
  if (!href?.startsWith("https://")) {
    return <span>{children}</span>;
  }
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        requestOpen(href);
      }}
      onAuxClick={suppress}
      onContextMenu={suppress}
    >
      {children}
    </a>
  );
}

/** Tables scroll inside their own strip instead of overflowing the popup —
 *  the typography plugin does this for code blocks but not for tables. */
function ScrollableTable({ children }: React.ComponentProps<"table">): React.JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  );
}

/** The copied content as the model was given it: the capture's template
 *  variables, of which `text` and `markup` (a formatted copy's HTML) are what
 *  was copied. Passed as the capture holds them — no second copy of a large
 *  selection is made to look through. */
type Source = Readonly<Record<string, string>>;

/** Whether an image URL may load. Remote images in model output are an
 *  exfiltration channel — a page can tell the model to put what it knows
 *  into an image URL, and rendering that ships it off without a click. And
 *  the model knows more than the copy: the user's self-introduction, a typed
 *  instruction, the window title, file paths. So an image loads only over
 *  https and only when its URL stands, character for character, in the copied
 *  content — an address the model was handed, to which it has added nothing.
 *  Everything else is dropped (`data:` never gets here: react-markdown
 *  blanks it). */
function isAllowedImage(src: string, source: Source): boolean {
  return (
    src.startsWith("https://") &&
    [source["text"], source["markup"]].some((copied) => copied?.includes(src) === true)
  );
}

// Context, not a prop drilled through react-markdown's `components` — that
// map must stay a stable module-level object so images don't remount (and
// refetch) on every streaming re-render.
const NO_SOURCE: Source = {};
const SourceContext = createContext(NO_SOURCE);

/** Images in model output, gated by isAllowedImage — a blocked image
 *  degrades to its alt text, silently. */
function GuardedImage({ src, alt }: React.ComponentProps<"img">): React.JSX.Element {
  const source = useContext(SourceContext);
  return typeof src === "string" && isAllowedImage(src, source) ? (
    <img src={src} alt={alt} />
  ) : (
    <span className="text-muted-foreground">{alt}</span>
  );
}

const components = { a: SystemBrowserLink, table: ScrollableTable, img: GuardedImage };

/** Model output, rendered as Markdown (GFM: tables, task lists, strikethrough).
 *  Raw HTML in the output is never rendered — react-markdown ignores it by
 *  default. `source` is the copied content the output answers: the only
 *  remote images that load are ones whose address appears in it. */
export function Markdown({
  text,
  source,
}: {
  text: string;
  source: Source | undefined;
}): React.JSX.Element {
  const t = useT();
  const [pendingHref, setPendingHref] = useState<string | undefined>(undefined);
  return (
    <>
      <div className="prose prose-sm max-w-none wrap-break-word">
        <SourceContext value={source ?? NO_SOURCE}>
          <LinkConfirmContext value={setPendingHref}>
            <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
              {text}
            </ReactMarkdown>
          </LinkConfirmContext>
        </SourceContext>
      </div>
      {pendingHref !== undefined && (
        <>
          {/* Mouse-only backdrop, like the popup's prompt palette. */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-10 bg-background/50"
            onClick={() => {
              setPendingHref(undefined);
            }}
          />
          <div
            role="alertdialog"
            className="fixed inset-x-0 top-1/2 z-20 mx-auto flex w-64 max-w-[calc(100vw-2rem)] -translate-y-1/2 flex-col gap-2 rounded-xl border bg-popover p-3 shadow-xl"
          >
            <p className="text-xs">{t.markdown.openLink}</p>
            {/* The URL stays LTR even in RTL locales — it is code, not prose. */}
            <p
              dir="ltr"
              className="max-h-24 overflow-y-auto font-mono text-[11px] break-all text-muted-foreground"
            >
              {pendingHref}
            </p>
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPendingHref(undefined);
                }}
              >
                {t.common.cancel}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  void invoke("open_url", { url: pendingHref });
                  setPendingHref(undefined);
                }}
              >
                {t.markdown.open}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
