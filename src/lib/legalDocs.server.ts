import fs from "fs/promises";
import path from "path";

export type VersionedLegalDocument = {
  body: string;
  contactEmail: string;
  description: string;
  effectiveDate: string;
  locale: "ko" | "en";
  slug: string;
  status: string;
  title: string;
  version: string;
};

type LegalManifest = {
  documents: Record<
    string,
    {
      latest: string;
      locale?: "ko" | "en";
      versions: Array<{
        effectiveDate: string;
        locale?: "ko" | "en";
        path: string;
        status: string;
        version: string;
      }>;
    }
  >;
};

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { body: raw.trim(), frontmatter: {} };

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [, key, value] = line.match(/^([^:]+):\s*(.*)$/) ?? [];
    if (!key) continue;
    frontmatter[key.trim()] = String(value ?? "")
      .trim()
      .replace(/^["']|["']$/g, "");
  }

  return {
    body: raw.slice(match[0].length).trim(),
    frontmatter,
  };
}

function stripLeadingDocumentTitle(body: string, title: string) {
  const lines = body.split("\n");
  const firstContentLineIndex = lines.findIndex((line) => line.trim());
  if (firstContentLineIndex < 0) return body;

  const firstContentLine = lines[firstContentLineIndex].trim();
  if (firstContentLine !== `# ${title}`) return body;

  return lines
    .slice(firstContentLineIndex + 1)
    .join("\n")
    .trim();
}

export async function loadVersionedLegalDocument(
  slug: string,
  requestedLocale?: "ko" | "en",
  requestedVersion?: string
) {
  const manifestPath = path.join(process.cwd(), "public/docs/legal/index.json");
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8")
  ) as LegalManifest;
  const entry = manifest.documents[slug];
  if (!entry) {
    throw new Error(`Legal document not found: ${slug}`);
  }

  const version = requestedVersion
    ? entry.versions.find(
        (item) =>
          item.version === requestedVersion &&
          (!requestedLocale || item.locale === requestedLocale)
      )
    : (entry.versions.find(
        (item) =>
          item.version === entry.latest &&
          (!requestedLocale || item.locale === requestedLocale)
      ) ??
      entry.versions.find((item) => item.locale === requestedLocale) ??
      entry.versions.find((item) => item.version === entry.latest) ??
      entry.versions[0]);
  if (!version) {
    throw new Error(
      requestedVersion
        ? `Legal document version not found: ${slug}@${requestedVersion}:${requestedLocale ?? "any"}`
        : `Legal document has no versions: ${slug}`
    );
  }

  const filePath = path.join(process.cwd(), "public", version.path);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = parseFrontmatter(raw);
  const title = parsed.frontmatter.title ?? slug;

  return {
    body: stripLeadingDocumentTitle(parsed.body, title),
    contactEmail: parsed.frontmatter.contact_email ?? "chris@matchharper.com",
    description: parsed.frontmatter.description ?? "",
    effectiveDate:
      parsed.frontmatter.effective_date ?? version.effectiveDate ?? "",
    locale:
      parsed.frontmatter.locale === "en" ||
      version.locale === "en" ||
      entry.locale === "en"
        ? "en"
        : "ko",
    slug: parsed.frontmatter.slug ?? slug,
    status: parsed.frontmatter.status ?? version.status ?? "draft",
    title,
    version: parsed.frontmatter.version ?? version.version,
  } satisfies VersionedLegalDocument;
}
