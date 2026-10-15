/** Open known Ashby job pages on their application tab; keep attribution params. */
export function applicationEntryUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol === "https:" && url.hostname === "jobs.ashbyhq.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    // Company landing pages and other deeper routes are not job overview pages.
    if (parts.length === 2) {
      url.pathname = `/${parts.join("/")}/application`;
      url.hash = "";
    }
  }
  return url;
}
