/** One model call as it went over `fetch` — what the screenshot harness
 *  (harness.ts) notes for every call the app makes, and what a demo
 *  recording keeps to serve the same call again without a network
 *  (scripts/demo-video.ts): the request, its URL and body — never its
 *  headers, which is where the API key rides — and the response as it
 *  streamed in. */
export interface Exchange {
  url: string;
  method: string;
  body: string;
  status: number;
  contentType: string | null;
  /** The response body: seconds after the request went out, and the text
   *  that arrived then (UTF-8 decoded per chunk; concatenated, the whole). */
  chunks: [number, string][];
}
