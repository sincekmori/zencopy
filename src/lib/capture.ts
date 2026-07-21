import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";
import { createLogger } from "@/lib/log.ts";

const log = createLogger("capture");

/** The captured content itself, for the popup to display ("what is acted on"). */
const TextSourceSchema = z.object({ kind: z.literal("text"), text: z.string() });
const RichTextSourceSchema = z.object({
  kind: z.literal("rich_text"),
  format: z.enum(["html", "rtf"]),
  markup: z.string(),
  plain: z.string(),
});
const ImageSourceSchema = z.object({
  kind: z.literal("image"),
  width: z.number(),
  height: z.number(),
  data_url: z.string(),
});
const FilesSourceSchema = z.object({ kind: z.literal("files"), paths: z.array(z.string()) });
const EmptySourceSchema = z.object({ kind: z.literal("empty") });

const SourceSchema = z.discriminatedUnion("kind", [
  TextSourceSchema,
  RichTextSourceSchema,
  ImageSourceSchema,
  FilesSourceSchema,
  EmptySourceSchema,
]);
export type Source = z.infer<typeof SourceSchema>;

/** A capture prepared by Rust, emitted as the `capture` event. The schema is
 *  the contract with Rust's serialization; the popup validates each event at
 *  the boundary. Field notes:
 *  - `action_id` / `label`: the matched action (empty if none) — what the
 *    switcher has selected.
 *  - `role`: catalog role to run with (already resolved to "default").
 *  - `instructions` / `prompt`: the action's system prompt and body, as
 *    Liquid templates rendered on the frontend with `vars`.
 *  - `runnable`: whether an action applies and is ready to run.
 *  - `align_bottom`: popup pinned to a bottom corner (card hugs that edge). */
export const CapturePayloadSchema = z.object({
  kind: z.enum(["text", "rich_text", "image", "files", "empty"]),
  source: SourceSchema,
  action_id: z.string(),
  label: z.string(),
  role: z.string(),
  instructions: z.string(),
  prompt: z.string(),
  vars: z.record(z.string(), z.string()),
  runnable: z.boolean(),
  align_bottom: z.boolean(),
});
export type CapturePayload = z.infer<typeof CapturePayloadSchema>;

/** A file or image sent to the model alongside the prompt. Typed by content
 *  (Rust sniffs magic bytes / UTF-8, never extensions): binary types become
 *  AI SDK file parts, `text/*` is inlined into the prompt. `path` is the full
 *  on-disk path for `files` captures — sent to the model in the prompt so it
 *  can tell the attached files apart — and absent for the clipboard image.
 *  `data` is base64, except for `text/*` where it is the text itself. */
const AttachmentSchema = z.object({
  name: z.string(),
  path: z.string().optional(),
  media_type: z.string(),
  data: z.string(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/** Total attachment budget per capture, mirrored by MAX_ATTACHMENT_BYTES in
 *  Rust — keeps an accidental C+C on a huge file from becoming a huge API
 *  request (providers reject oversized payloads anyway). */
export const MAX_ATTACHMENT_MB = 10;

/** Thrown (as an Error message, also returned by Rust) when a capture's
 *  attachments exceed MAX_ATTACHMENT_MB in total. */
export const ATTACHMENT_TOO_LARGE = "attachment-too-large";

/** Error-message prefixes from Rust: `<prefix>:<file name>`. */
export const UNSUPPORTED_FILE_PREFIX = "unsupported-file:";
export const FILE_UNREADABLE_PREFIX = "file-unreadable:";

/** The attachments for a capture: the clipboard image as-is, or the copied
 *  files read (and size-checked) by Rust. Throws with ATTACHMENT_TOO_LARGE or
 *  the Rust prefixes above; the popup maps those to i18n messages. */
export async function buildAttachments(source: Source): Promise<Attachment[] | undefined> {
  switch (source.kind) {
    case "image": {
      const base64 = source.data_url.slice(source.data_url.indexOf(",") + 1);
      // base64 inflates by 4/3, so decoded size is length * 3/4.
      if ((base64.length * 3) / 4 > MAX_ATTACHMENT_MB * 1024 * 1024) {
        throw new Error(ATTACHMENT_TOO_LARGE);
      }
      return [{ name: "clipboard.png", media_type: "image/png", data: base64 }];
    }
    case "files": {
      const raw = await invoke<Attachment[]>("read_capture_files", { paths: source.paths });
      const parsed = z.array(AttachmentSchema).safeParse(raw);
      if (!parsed.success) {
        // Version skew between Rust and the webview — warn, send as-is.
        log.warn("read_capture_files returned an unexpected shape; using it as-is", parsed.error);
        return raw;
      }
      return parsed.data;
    }
    default: {
      return undefined;
    }
  }
}

/** A stable signature of a capture's content, for de-duplicating triggers. */
export function sourceSignature(source: Source): string {
  switch (source.kind) {
    case "text": {
      return `text:${source.text}`;
    }
    case "rich_text": {
      return `rich_text:${source.format}:${source.markup}`;
    }
    case "image": {
      return `image:${source.width}x${source.height}:${source.data_url.length}`;
    }
    case "files": {
      return `files:${source.paths.join("\0")}`;
    }
    case "empty": {
      return "empty";
    }
  }
}
