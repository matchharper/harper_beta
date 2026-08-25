function normalizeLink(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function normalizeLinkedinCompanyUrl(raw: string): string | null {
  try {
    const parsed = new URL(normalizeLink(raw));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) {
      return null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2 || segments[0]?.toLowerCase() !== "company") {
      return null;
    }

    const slug = decodeURIComponent(segments[1] ?? "")
      .trim()
      .toLowerCase();
    if (!slug) return null;

    return `https://www.linkedin.com/company/${slug}`;
  } catch {
    return null;
  }
}
