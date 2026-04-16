#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const COMPANY_DB_LOOKUP_SELECT =
  "id, name, linkedin_url, logo, website_url, description, short_description, last_updated_at";
const DEFAULT_FETCH_RETRIES = 2;
const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const WORKSPACE_SELECT =
  "company_workspace_id, company_name, homepage_url, career_url, linkedin_url, logo_url, logo_storage_path, company_description, company_db_id, created_at, updated_at";
const WORKSPACE_MUTABLE_FIELDS = [
  "career_url",
  "company_db_id",
  "company_description",
  "company_name",
  "homepage_url",
  "linkedin_url",
  "logo_storage_path",
  "logo_url",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

function parseArgs(argv) {
  const options = {
    apply: false,
    filter: "",
    input: path.join(projectRoot, "docs", "list.md"),
    limit: null,
    outputDir: path.join(projectRoot, "output", "company_workspace_sync"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--input") {
      options.input = path.resolve(projectRoot, argv[index + 1] ?? "");
      index += 1;
      continue;
    }

    if (arg === "--filter") {
      options.filter = String(argv[index + 1] ?? "").trim().toLowerCase();
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const raw = Number.parseInt(String(argv[index + 1] ?? ""), 10);
      options.limit = Number.isFinite(raw) && raw > 0 ? raw : null;
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = path.resolve(projectRoot, argv[index + 1] ?? "");
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function ensureEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function ensureNonEmptyString(value, fieldName) {
  const nextValue = String(value ?? "").trim();
  if (!nextValue) {
    throw new Error(`${fieldName} is required`);
  }
  return nextValue;
}

function normalizeLink(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeLinkedinCompanyUrl(raw) {
  try {
    const parsed = new URL(normalizeLink(raw));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) {
      return null;
    }

    const slugVariants = extractLinkedinCompanySlugVariants(raw);
    const preferredSlug = slugVariants.find((slug) => !slug.includes("%"));
    if (!preferredSlug) {
      return null;
    }

    return `https://www.linkedin.com/company/${preferredSlug}`;
  } catch {
    return null;
  }
}

function extractLinkedinCompanySlugVariants(raw) {
  try {
    const parsed = new URL(normalizeLink(raw));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) {
      return [];
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0]?.toLowerCase() !== "company" || !segments[1]) {
      return [];
    }

    const rawSlug = segments[1].trim().toLowerCase();
    const decodedSlug = decodeURIComponent(rawSlug).trim().toLowerCase();
    const encodedDecodedSlug = encodeURIComponent(decodedSlug).toLowerCase();

    return Array.from(
      new Set([rawSlug, decodedSlug, encodedDecodedSlug].filter(Boolean))
    );
  } catch {
    return [];
  }
}

function buildLinkedinCandidates(normalizedLinkedinUrl) {
  const slugVariants = extractLinkedinCompanySlugVariants(normalizedLinkedinUrl);
  if (slugVariants.length === 0) return [];

  const candidates = [];
  for (const slug of slugVariants) {
    const withWww = `https://www.linkedin.com/company/${slug}`;
    const withoutWww = withWww.replace("https://www.", "https://");
    candidates.push(withWww, `${withWww}/`, withoutWww, `${withoutWww}/`);
  }

  return Array.from(new Set(candidates));
}

function coerceJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickCompanyDbDescription(row) {
  const shortDescription = String(row?.short_description ?? "").trim();
  if (shortDescription) {
    return shortDescription;
  }

  const description = String(row?.description ?? "").trim();
  return description || null;
}

function pickString(primaryValue, fallbackValue = null) {
  const primary = String(primaryValue ?? "").trim();
  if (primary) return primary;

  const fallback = String(fallbackValue ?? "").trim();
  return fallback || null;
}

function normalizeCompareValue(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  return value ?? null;
}

function buildFieldDiff(existing, nextPayload) {
  if (!existing) return {};

  const diff = {};
  for (const field of WORKSPACE_MUTABLE_FIELDS) {
    const before = normalizeCompareValue(existing[field]);
    const after = normalizeCompareValue(nextPayload[field]);
    if (before !== after) {
      diff[field] = {
        after,
        before,
      };
    }
  }

  return diff;
}

function parseListFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const rows = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const columns = line.split("\t");
    const companyName = String(columns[0] ?? "").trim();
    if (!companyName) {
      throw new Error(`Missing company name at line ${index + 1}`);
    }

    rows.push({
      careerUrl: String(columns[2] ?? "").trim(),
      companyName,
      lineNumber: index + 1,
      linkedinUrl: String(columns[1] ?? "").trim(),
      rawLine: line,
    });
  }

  return rows;
}

async function selectFirst(query, errorMessage) {
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? errorMessage);
  }

  return coerceJsonArray(data)[0] ?? null;
}

async function findCompanyDbByLinkedinUrl(admin, linkedinUrl) {
  const rawLinkedinUrl = String(linkedinUrl ?? "").trim();
  const normalizedLinkedinUrl = rawLinkedinUrl
    ? normalizeLinkedinCompanyUrl(rawLinkedinUrl)
    : null;
  const linkedinSlugVariants = extractLinkedinCompanySlugVariants(rawLinkedinUrl);

  if (!normalizedLinkedinUrl || linkedinSlugVariants.length === 0) {
    return {
      match: null,
      normalizedLinkedinUrl,
      rawLinkedinUrl,
    };
  }

  const exactMatch = await selectFirst(
    admin
      .from("company_db")
      .select(COMPANY_DB_LOOKUP_SELECT)
      .in("linkedin_url", buildLinkedinCandidates(normalizedLinkedinUrl))
      .order("last_updated_at", { ascending: false, nullsFirst: false })
      .limit(1),
    "Failed to resolve company by LinkedIn URL"
  );

  if (exactMatch) {
    return {
      match: exactMatch,
      normalizedLinkedinUrl,
      rawLinkedinUrl,
    };
  }

  let fuzzyMatch = null;
  for (const linkedinSlug of linkedinSlugVariants) {
    fuzzyMatch = await selectFirst(
      admin
        .from("company_db")
        .select(COMPANY_DB_LOOKUP_SELECT)
        .ilike("linkedin_url", `%/company/${linkedinSlug}%`)
        .order("last_updated_at", { ascending: false, nullsFirst: false })
        .limit(1),
      "Failed to resolve company by LinkedIn slug"
    );

    if (fuzzyMatch) break;
  }

  return {
    match: fuzzyMatch,
    normalizedLinkedinUrl,
    rawLinkedinUrl,
  };
}

async function resolveCompanyDbRecord(admin, entry) {
  const { match: linkedinMatch, normalizedLinkedinUrl, rawLinkedinUrl } =
    await findCompanyDbByLinkedinUrl(admin, entry.linkedinUrl);
  const normalizedCompanyName = String(entry.companyName ?? "").trim();

  if (linkedinMatch) {
    return {
      companyDbId: Number(linkedinMatch.id),
      companyDbName: String(linkedinMatch.name ?? "").trim() || null,
      companyDescription: pickCompanyDbDescription(linkedinMatch),
      homepageUrl: pickString(linkedinMatch.website_url),
      linkedinUrl: normalizedLinkedinUrl,
      logoUrl: pickString(linkedinMatch.logo),
      matchedBy: "linkedin_url",
      rawLinkedinUrl,
    };
  }

  if (normalizedCompanyName) {
    const companyNameMatch = await selectFirst(
      admin
        .from("company_db")
        .select(COMPANY_DB_LOOKUP_SELECT)
        .ilike("name", normalizedCompanyName)
        .order("last_updated_at", { ascending: false, nullsFirst: false })
        .limit(1),
      "Failed to resolve company by name"
    );

    if (companyNameMatch) {
      return {
        companyDbId: Number(companyNameMatch.id),
        companyDbName: String(companyNameMatch.name ?? "").trim() || null,
        companyDescription: pickCompanyDbDescription(companyNameMatch),
        homepageUrl: pickString(companyNameMatch.website_url),
        linkedinUrl:
          normalizedLinkedinUrl ?? pickString(companyNameMatch.linkedin_url),
        logoUrl: pickString(companyNameMatch.logo),
        matchedBy: "company_name",
        rawLinkedinUrl,
      };
    }
  }

  return {
    companyDbId: null,
    companyDbName: null,
    companyDescription: null,
    homepageUrl: null,
    linkedinUrl: normalizedLinkedinUrl ?? (rawLinkedinUrl || null),
    logoUrl: null,
    matchedBy: "none",
    rawLinkedinUrl,
  };
}

async function findExistingWorkspace(admin, resolvedRecord, companyName) {
  if (resolvedRecord.companyDbId !== null) {
    const byCompanyDb = await selectFirst(
      admin
        .from("company_workspace")
        .select(WORKSPACE_SELECT)
        .eq("company_db_id", resolvedRecord.companyDbId)
        .limit(1),
      "Failed to resolve existing workspace by company_db_id"
    );

    if (byCompanyDb) {
      return {
        matchedBy: "company_db_id",
        row: byCompanyDb,
      };
    }
  }

  if (resolvedRecord.linkedinUrl) {
    const exactLinkedinMatch = await selectFirst(
      admin
        .from("company_workspace")
        .select(WORKSPACE_SELECT)
        .in("linkedin_url", buildLinkedinCandidates(resolvedRecord.linkedinUrl))
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1),
      "Failed to resolve existing workspace by LinkedIn URL"
    );

    if (exactLinkedinMatch) {
      return {
        matchedBy: "linkedin_url",
        row: exactLinkedinMatch,
      };
    }

    const linkedinSlugVariants = extractLinkedinCompanySlugVariants(
      resolvedRecord.linkedinUrl
    );
    for (const linkedinSlug of linkedinSlugVariants) {
      const fuzzyLinkedinMatch = await selectFirst(
        admin
          .from("company_workspace")
          .select(WORKSPACE_SELECT)
          .ilike("linkedin_url", `%/company/${linkedinSlug}%`)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(1),
        "Failed to resolve existing workspace by LinkedIn slug"
      );

      if (fuzzyLinkedinMatch) {
        return {
          matchedBy: "linkedin_slug",
          row: fuzzyLinkedinMatch,
        };
      }
    }
  }

  if (companyName) {
    const nameMatch = await selectFirst(
      admin
        .from("company_workspace")
        .select(WORKSPACE_SELECT)
        .ilike("company_name", companyName)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1),
      "Failed to resolve existing workspace by company name"
    );

    if (nameMatch) {
      const existingCompanyDbId =
        typeof nameMatch.company_db_id === "number"
          ? nameMatch.company_db_id
          : null;

      if (
        resolvedRecord.companyDbId !== null &&
        existingCompanyDbId !== null &&
        existingCompanyDbId !== resolvedRecord.companyDbId
      ) {
        return {
          matchedBy: "company_name_conflict",
          row: null,
        };
      }

      return {
        matchedBy: "company_name",
        row: nameMatch,
      };
    }
  }

  return {
    matchedBy: "none",
    row: null,
  };
}

function buildWorkspacePayload(entry, resolvedRecord, existingWorkspace) {
  const now = new Date().toISOString();

  return {
    career_url: pickString(entry.careerUrl, existingWorkspace?.career_url),
    company_db_id:
      resolvedRecord.companyDbId ??
      (typeof existingWorkspace?.company_db_id === "number"
        ? existingWorkspace.company_db_id
        : null),
    company_description: pickString(
      resolvedRecord.companyDescription,
      existingWorkspace?.company_description
    ),
    company_name: ensureNonEmptyString(
      entry.companyName ?? existingWorkspace?.company_name,
      "companyName"
    ),
    homepage_url: pickString(
      resolvedRecord.homepageUrl,
      existingWorkspace?.homepage_url
    ),
    linkedin_url: pickString(
      resolvedRecord.linkedinUrl,
      existingWorkspace?.linkedin_url
    ),
    logo_storage_path: pickString(existingWorkspace?.logo_storage_path),
    logo_url: pickString(resolvedRecord.logoUrl, existingWorkspace?.logo_url),
    updated_at: now,
  };
}

async function upsertWorkspace(admin, existingWorkspace, payload) {
  const query = existingWorkspace
    ? admin
        .from("company_workspace")
        .update(payload)
        .eq("company_workspace_id", existingWorkspace.company_workspace_id)
    : admin.from("company_workspace").insert({
        ...payload,
        created_at: payload.updated_at,
      });

  const { data, error } = await query.select(WORKSPACE_SELECT).single();
  if (error) {
    throw new Error(error.message ?? "Failed to save workspace");
  }

  return data;
}

function buildReportPath(outputDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(outputDir, `company-workspace-sync-${timestamp}.json`);
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/syncCompanyWorkspacesFromList.mjs [--apply] [--input docs/list.md] [--filter text] [--limit N]",
      "",
      "Default mode is dry-run.",
    ].join("\n")
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeoutAndRetry(input, init = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= DEFAULT_FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, DEFAULT_FETCH_TIMEOUT_MS);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
      if (attempt >= DEFAULT_FETCH_RETRIES) {
        break;
      }

      await sleep(300 * (attempt + 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = ensureEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = ensureEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetchWithTimeoutAndRetry,
    },
  });

  let rows = parseListFile(options.input);

  if (options.filter) {
    rows = rows.filter((row) => {
      return (
        row.companyName.toLowerCase().includes(options.filter) ||
        row.linkedinUrl.toLowerCase().includes(options.filter) ||
        row.careerUrl.toLowerCase().includes(options.filter)
      );
    });
  }

  if (options.limit !== null) {
    rows = rows.slice(0, options.limit);
  }

  if (rows.length === 0) {
    throw new Error("No rows found to process");
  }

  const report = {
    apply: options.apply,
    generatedAt: new Date().toISOString(),
    input: path.relative(projectRoot, options.input),
    results: [],
    summary: {
      companyDbMatched: 0,
      companyDbUnmatched: 0,
      errors: 0,
      insert: 0,
      noop: 0,
      total: rows.length,
      update: 0,
      warnings: 0,
    },
  };

  for (const row of rows) {
    const result = {
      action: "unknown",
      companyDbId: null,
      companyDbMatchedBy: "none",
      companyName: row.companyName,
      error: null,
      existingWorkspaceId: null,
      fieldDiff: {},
      finalWorkspaceId: null,
      inputCareerUrl: row.careerUrl || null,
      inputLinkedinUrl: row.linkedinUrl || null,
      lineNumber: row.lineNumber,
      matchedWorkspaceBy: "none",
      normalizedLinkedinUrl: null,
      warning: null,
    };

    try {
      const resolvedRecord = await resolveCompanyDbRecord(admin, row);
      result.companyDbId = resolvedRecord.companyDbId;
      result.companyDbMatchedBy = resolvedRecord.matchedBy;
      result.normalizedLinkedinUrl = resolvedRecord.linkedinUrl;

      if (resolvedRecord.companyDbId === null) {
        report.summary.companyDbUnmatched += 1;
      } else {
        report.summary.companyDbMatched += 1;
      }

      const existingWorkspaceResolution = await findExistingWorkspace(
        admin,
        resolvedRecord,
        row.companyName
      );
      const existingWorkspace = existingWorkspaceResolution.row;
      result.matchedWorkspaceBy = existingWorkspaceResolution.matchedBy;
      result.existingWorkspaceId =
        existingWorkspace?.company_workspace_id ?? null;

      if (existingWorkspaceResolution.matchedBy === "company_name_conflict") {
        result.action = "warning";
        result.warning =
          "Skipped because company_name matched a different company_db_id.";
        report.summary.warnings += 1;
        report.results.push(result);
        console.log(
          `[warning] ${row.companyName}: company_name matched a conflicting workspace`
        );
        continue;
      }

      const payload = buildWorkspacePayload(
        row,
        resolvedRecord,
        existingWorkspace
      );
      const fieldDiff = buildFieldDiff(existingWorkspace, payload);
      result.fieldDiff = fieldDiff;

      if (existingWorkspace && Object.keys(fieldDiff).length === 0) {
        result.action = "noop";
        result.finalWorkspaceId = existingWorkspace.company_workspace_id;
        report.summary.noop += 1;
        report.results.push(result);
        console.log(`[noop] ${row.companyName}`);
        continue;
      }

      result.action = existingWorkspace ? "update" : "insert";

      if (!options.apply) {
        result.finalWorkspaceId =
          existingWorkspace?.company_workspace_id ?? null;
        report.summary[result.action] += 1;
        report.results.push(result);
        console.log(`[dry-run][${result.action}] ${row.companyName}`);
        continue;
      }

      const savedWorkspace = await upsertWorkspace(admin, existingWorkspace, payload);
      result.finalWorkspaceId = savedWorkspace.company_workspace_id;
      report.summary[result.action] += 1;
      report.results.push(result);
      console.log(`[apply][${result.action}] ${row.companyName}`);
    } catch (error) {
      result.action = "error";
      result.error = error instanceof Error ? error.message : String(error);
      report.summary.errors += 1;
      report.results.push(result);
      console.error(`[error] ${row.companyName}: ${result.error}`);
    }
  }

  fs.mkdirSync(options.outputDir, { recursive: true });
  const reportPath = buildReportPath(options.outputDir);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("");
  console.log(`mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`rows: ${report.summary.total}`);
  console.log(`insert: ${report.summary.insert}`);
  console.log(`update: ${report.summary.update}`);
  console.log(`noop: ${report.summary.noop}`);
  console.log(`warnings: ${report.summary.warnings}`);
  console.log(`errors: ${report.summary.errors}`);
  console.log(`company_db matched: ${report.summary.companyDbMatched}`);
  console.log(`company_db unmatched: ${report.summary.companyDbUnmatched}`);
  console.log(`report: ${path.relative(projectRoot, reportPath)}`);
}

main().catch((error) => {
  if (String(error?.message ?? "").startsWith("Unknown argument:")) {
    printUsage();
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
