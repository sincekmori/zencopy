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
// map must stay a stable module-level object (see ImageHostContext below).
const LinkConfirmContext = createContext<(href: string) => void>(() => undefined);

/** Anchors in model output: never navigate the popup webview. A click asks
 *  first, showing the real URL — link text in model output can lie, and a
 *  clicked URL's query string is an exfiltration channel for the captured
 *  content. Confirmed links go to the system browser via `open_url`, which
 *  enforces https. */
function SystemBrowserLink({ href, children }: React.ComponentProps<"a">): React.JSX.Element {
  const requestOpen = useContext(LinkConfirmContext);
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (href) {
          requestOpen(href);
        }
      }}
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

/** Whether an image URL may load. Remote images in model output are an
 *  exfiltration channel — a malicious action could instruct the model to
 *  embed the captured text in an image URL, and rendering it would ship the
 *  data to that server. Policy: `data:` images always (no network), http(s)
 *  only from the host the capture came from (that host already served the
 *  copied content, so it learns nothing new), everything else is dropped. */
function isAllowedImage(src: string, imageHost: string | undefined): boolean {
  if (src.startsWith("data:image/")) {
    return true;
  }
  if (imageHost === undefined) {
    return false;
  }
  try {
    const url = new URL(src);
    return (url.protocol === "https:" || url.protocol === "http:") && url.host === imageHost;
  } catch {
    return false; // relative URLs have no meaningful base inside the popup
  }
}

// Context, not a prop drilled through react-markdown's `components` — that
// map must stay a stable module-level object so images don't remount (and
// refetch) on every streaming re-render.
const ImageHostContext = createContext<string | undefined>(undefined);

/** Images in model output, gated by isAllowedImage — a blocked image
 *  degrades to its alt text, silently. */
function GuardedImage({ src, alt }: React.ComponentProps<"img">): React.JSX.Element {
  const imageHost = useContext(ImageHostContext);
  return typeof src === "string" && isAllowedImage(src, imageHost) ? (
    <img src={src} alt={alt} />
  ) : (
    <span className="text-muted-foreground">{alt}</span>
  );
}

const components = { a: SystemBrowserLink, table: ScrollableTable, img: GuardedImage };

/** Model output, rendered as Markdown (GFM: tables, task lists, strikethrough).
 *  Raw HTML in the output is never rendered — react-markdown ignores it by
 *  default. `imageHost` is the one host remote images may load from (the
 *  capture's source). */
export function Markdown({
  text,
  imageHost,
}: {
  text: string;
  imageHost?: string | undefined;
}): React.JSX.Element {
  const t = useT();
  const [pendingHref, setPendingHref] = useState<string | undefined>(undefined);
  return (
    <>
      <div className="prose prose-sm max-w-none wrap-break-word">
        <ImageHostContext value={imageHost}>
          <LinkConfirmContext value={setPendingHref}>
            <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
              {text}
            </ReactMarkdown>
          </LinkConfirmContext>
        </ImageHostContext>
      </div>
      {pendingHref !== undefined && (
        <>
          {/* Mouse-only backdrop, like the popup's action palette. */}
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
