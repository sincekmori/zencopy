# zencopy.app

The ZenCopy homepage and documentation: an [Astro](https://astro.build) + [Starlight](https://starlight.astro.build) static site, English and Japanese.

```sh
bun install
bun run dev        # local dev server
bun run build      # static build into dist/
bun run deploy     # build + deploy to Cloudflare Workers (needs `wrangler login`)
```

Content lives in [src/content/docs/](src/content/docs/) — English at the root, Japanese under `ja/`.
Landing pages are `index.mdx`; `/privacy` and `/terms` are hidden from the sidebar but linked from the landing footer.
Deployment is configured in [wrangler.jsonc](wrangler.jsonc); attach the `zencopy.app` custom domain in the Cloudflare dashboard once the domain is registered.
