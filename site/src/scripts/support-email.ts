// Folds the About window's ?app_version=<v>&os=<os>&locale=<code> query
// into the support mailto's subject — see SupportEmail.astro for the full
// design note. Middle dots keep the subject flat (the OS string already
// carries one pair of parentheses for the architecture), and everything
// stays human-readable: the subject is the user's to see (and edit) before
// sending, never an opaque diagnostic blob.
const params = new URLSearchParams(location.search);
const version = params.get("app_version");
if (version !== null) {
  const subject = encodeURIComponent(
    [`ZenCopy ${version}`, params.get("os"), params.get("locale")]
      .filter((part) => part !== null)
      .join(" · "),
  );
  for (const link of document.querySelectorAll("[data-support-email]")) {
    const base = link.getAttribute("href");
    link.setAttribute("href", `${base}?subject=${subject}`);
  }
}
