import { stripPostgresUnsafeChars } from "@/lib/textSanitization";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

export type DocumentCacheWrite = {
  excerpt?: string | null;
  markdown: string;
  title?: string | null;
  url: string;
};

function optionalString(value: unknown) {
  const text =
    typeof value === "string" ? stripPostgresUnsafeChars(value).trim() : "";
  return text || null;
}

export function normalizeDocumentText(value: string) {
  return stripPostgresUnsafeChars(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function documentExcerpt(markdown: string) {
  return normalizeDocumentText(
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/[#>*_\-[\]()]/g, " ")
      .replace(/\s+/g, " ")
  ).slice(0, 2_500);
}

function isLinkedinHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "linkedin.com" || normalized.endsWith(".linkedin.com");
}

export function normalizeOpenUrl(rawUrl: string) {
  const input = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withProtocol);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs can be opened.");
  }

  if (
    isLinkedinHost(url.hostname) &&
    /^\/jobs\/search\/?$/i.test(url.pathname)
  ) {
    const currentJobId = url.searchParams.get("currentJobId")?.trim();
    if (currentJobId && /^\d+$/.test(currentJobId)) {
      url.pathname = `/jobs/view/${currentJobId}`;
      url.search = "";
    }
  }

  url.hash = "";
  return url.toString();
}

export function getUrlCacheVariants(rawUrl: string, normalizedUrl: string) {
  return Array.from(
    new Set(
      [
        rawUrl.trim(),
        normalizedUrl,
        normalizedUrl.endsWith("/") ? normalizedUrl.slice(0, -1) : null,
      ].filter((value): value is string => Boolean(value))
    )
  );
}

export async function fetchCachedDocument(args: {
  admin: TalentAdminClient;
  urlVariants: string[];
}) {
  const { data, error } = await args.admin
    .from("documents")
    .select("id, url, title, markdown, excerpt, created_at")
    .in("url", args.urlVariants)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read document cache.");
  }

  const markdown = normalizeDocumentText(String(data?.markdown ?? ""));
  if (!data || !markdown) return null;

  return {
    createdAt: data.created_at,
    documentId: data.id,
    excerpt: optionalString(data.excerpt) ?? documentExcerpt(markdown),
    markdown,
    title: optionalString(data.title) ?? optionalString(data.url) ?? "Untitled",
    url: optionalString(data.url) ?? args.urlVariants[0],
  };
}

function prepareDocumentCacheRow(document: DocumentCacheWrite) {
  const url = normalizeOpenUrl(document.url);
  const markdown = normalizeDocumentText(document.markdown);
  if (!markdown) return null;

  return {
    created_at: new Date().toISOString(),
    excerpt:
      optionalString(document.excerpt)?.slice(0, 2_500) ??
      documentExcerpt(markdown),
    markdown,
    title: optionalString(document.title)?.slice(0, 2_000) ?? url,
    url,
  };
}

export async function saveDocumentCache(args: {
  admin: TalentAdminClient;
  document: DocumentCacheWrite;
}) {
  const row = prepareDocumentCacheRow(args.document);
  if (!row) throw new Error("Exa returned no text for the URL.");

  const { data: existing, error: lookupError } = await args.admin
    .from("documents")
    .select("id")
    .eq("url", row.url)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message ?? "Failed to read document cache.");
  }

  const write = existing
    ? args.admin.from("documents").update(row).eq("id", existing.id)
    : args.admin.from("documents").insert(row);
  const { data, error } = await write
    .select("id, created_at")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save document cache.");
  }

  return {
    createdAt: data.created_at,
    documentId: data.id,
    ...row,
  };
}

export async function saveDocumentCaches(args: {
  admin: TalentAdminClient;
  documents: DocumentCacheWrite[];
}) {
  const rowsByUrl = new Map<
    string,
    NonNullable<ReturnType<typeof prepareDocumentCacheRow>>
  >();

  for (const document of args.documents) {
    const row = prepareDocumentCacheRow(document);
    if (row) rowsByUrl.set(row.url, row);
  }

  const rows = [...rowsByUrl.values()];
  if (rows.length === 0) return { savedCount: 0 };

  await Promise.all(
    rows.map((document) =>
      saveDocumentCache({ admin: args.admin, document })
    )
  );

  return { savedCount: rows.length };
}
