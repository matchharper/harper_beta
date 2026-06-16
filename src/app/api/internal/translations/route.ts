import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";
import {
  canInspectCareerTranslations,
  isInternalEmail,
} from "@/lib/internalAccess";
import {
  getTranslationCategory,
  normalizeTranslationCategoryFilter,
} from "@/lib/translationCategories";
import type { Database } from "@/types/database.types";

const TABLE = "translation_entries" as const;
const DEFAULT_NAMESPACE = "career";
const DEFAULT_PAGE_SIZE = 50;
const MAX_LOOKUP_KEYS = 100;
const MAX_PAGE_SIZE = 100;
const SUPPORTED_LOCALES = new Set(["ko", "en"]);
const SUPPORTED_STATUSES = new Set(["draft", "reviewed", "published"]);

type TranslationEntryInsert =
  Database["public"]["Tables"]["translation_entries"]["Insert"];

type TranslationEntryInput = {
  description?: string | null;
  key?: string;
  locale?: string;
  status?: string;
  value?: string;
};

type TranslationGroupRow = {
  description: string | null;
  en: string;
  key: string;
  ko: string;
  updated_at: string | null;
  updated_by: string | null;
};

type TranslationEntryRow = {
  description: string | null;
  key: string;
  locale: string;
  updated_at: string | null;
  updated_by: string | null;
  value: string;
};

async function requireInternalUser(req: NextRequest) {
  const user = await getRequestUser(req);
  if (
    !user ||
    (!isInternalEmail(user.email) && !canInspectCareerTranslations(user.email))
  ) {
    return null;
  }
  return user;
}

function getNamespace(req: NextRequest) {
  return req.nextUrl.searchParams.get("namespace")?.trim() || DEFAULT_NAMESPACE;
}

function getPageSize(req: NextRequest) {
  const rawLimit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "");
  if (!Number.isFinite(rawLimit)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(rawLimit, MAX_PAGE_SIZE));
}

function getMinKoLength(req: NextRequest) {
  const rawValue = req.nextUrl.searchParams.get("minKoLength");
  if (!rawValue) return null;
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function getCategoryFilter(req: NextRequest) {
  const category = normalizeTranslationCategoryFilter(
    req.nextUrl.searchParams.get("category")
  );
  return category === "all" ? null : category;
}

function getLookupKeys(req: NextRequest) {
  const rawValue = req.nextUrl.searchParams.get("keys");
  if (!rawValue) return [];

  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_LOOKUP_KEYS);
}

function normalizeGroupRow(row: TranslationGroupRow) {
  const category = getTranslationCategory(row.key);

  return {
    category: category.id,
    categoryLabel: category.label,
    description: row.description ?? "",
    en: row.en ?? "",
    key: row.key,
    ko: row.ko ?? "",
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
  };
}

type NormalizedTranslationGroupRow = ReturnType<typeof normalizeGroupRow>;

async function fetchTranslationGroups({
  cursor,
  limit,
  minKoLength,
  namespace,
  query,
}: {
  cursor: string | null;
  limit: number;
  minKoLength: number | null;
  namespace: string;
  query: string | null;
}) {
  const { data, error } = await supabaseServer.rpc(
    "list_translation_entry_groups",
    {
      p_after_key: cursor ?? undefined,
      p_limit: limit,
      p_min_ko_length: minKoLength ?? undefined,
      p_namespace: namespace,
      p_query: query ?? undefined,
    }
  );

  if (error) throw error;

  return (data ?? []) as TranslationGroupRow[];
}

async function fetchTranslationPage(req: NextRequest, namespace: string) {
  const limit = getPageSize(req);
  const query = req.nextUrl.searchParams.get("query")?.trim() || null;
  const cursor = req.nextUrl.searchParams.get("cursor")?.trim() || null;
  const minKoLength = getMinKoLength(req);
  const category = getCategoryFilter(req);

  if (!category) {
    const data = await fetchTranslationGroups({
      cursor,
      limit: limit + 1,
      minKoLength,
      namespace,
      query,
    });

    const rows = data.slice(0, limit).map(normalizeGroupRow);
    const hasMore = data.length > limit;

    return {
      category,
      hasMore,
      limit,
      minKoLength,
      namespace,
      nextCursor: hasMore ? (rows.at(-1)?.key ?? null) : null,
      query,
      rows,
    };
  }

  const matchingRows: NormalizedTranslationGroupRow[] = [];
  let scanCursor = cursor;
  let hasMoreSourceRows = true;

  while (matchingRows.length <= limit && hasMoreSourceRows) {
    const data = await fetchTranslationGroups({
      cursor: scanCursor,
      limit: MAX_PAGE_SIZE,
      minKoLength,
      namespace,
      query,
    });

    if (data.length === 0) {
      hasMoreSourceRows = false;
      break;
    }

    for (const rawRow of data) {
      scanCursor = rawRow.key;
      const row = normalizeGroupRow(rawRow);
      if (row.category === category) {
        matchingRows.push(row);
        if (matchingRows.length > limit) break;
      }
    }

    hasMoreSourceRows = data.length >= MAX_PAGE_SIZE;
  }

  const rows = matchingRows.slice(0, limit);
  const hasMore = matchingRows.length > limit || hasMoreSourceRows;

  return {
    category,
    hasMore,
    limit,
    minKoLength,
    namespace,
    nextCursor: hasMore ? (rows.at(-1)?.key ?? null) : null,
    query,
    rows,
  };
}

async function fetchTranslationsByKeys(namespace: string, keys: string[]) {
  const { data, error } = await supabaseServer
    .from(TABLE)
    .select("key,locale,value,description,updated_at,updated_by")
    .eq("namespace", namespace)
    .in("key", keys)
    .in("locale", ["ko", "en"]);

  if (error) throw error;

  const grouped = new Map<string, TranslationGroupRow>();
  keys.forEach((key) => {
    grouped.set(key, {
      description: null,
      en: "",
      key,
      ko: "",
      updated_at: null,
      updated_by: null,
    });
  });

  ((data ?? []) as TranslationEntryRow[]).forEach((row) => {
    const current =
      grouped.get(row.key) ??
      ({
        description: null,
        en: "",
        key: row.key,
        ko: "",
        updated_at: null,
        updated_by: null,
      } satisfies TranslationGroupRow);

    if (row.locale === "ko") current.ko = row.value ?? "";
    if (row.locale === "en") current.en = row.value ?? "";
    if (row.description) current.description = row.description;
    if (
      row.updated_at &&
      (!current.updated_at || row.updated_at > current.updated_at)
    ) {
      current.updated_at = row.updated_at;
    }
    if (row.updated_by) current.updated_by = row.updated_by;

    grouped.set(row.key, current);
  });

  return {
    keys,
    namespace,
    rows: keys
      .map((key) => grouped.get(key))
      .filter((row): row is TranslationGroupRow => Boolean(row))
      .map(normalizeGroupRow),
  };
}

export async function GET(req: NextRequest) {
  const user = await requireInternalUser(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const namespace = getNamespace(req);
    const lookupKeys = getLookupKeys(req);
    if (lookupKeys.length > 0) {
      return NextResponse.json(
        await fetchTranslationsByKeys(namespace, lookupKeys)
      );
    }

    return NextResponse.json(await fetchTranslationPage(req, namespace));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load translations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await requireInternalUser(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const namespace = getNamespace(req);
    const body = (await req.json()) as { entries?: TranslationEntryInput[] };
    const entries = Array.isArray(body.entries) ? body.entries : [];

    const rows = entries.reduce<TranslationEntryInsert[]>((acc, entry) => {
      const key = String(entry.key ?? "").trim();
      const locale = String(entry.locale ?? "").trim();
      const value = String(entry.value ?? "");
      const status = SUPPORTED_STATUSES.has(String(entry.status ?? "draft"))
        ? String(entry.status ?? "draft")
        : "draft";

      if (!key || !SUPPORTED_LOCALES.has(locale)) return acc;

      acc.push({
        namespace,
        key,
        locale,
        value,
        status,
        description:
          typeof entry.description === "string"
            ? entry.description.trim() || null
            : null,
        updated_by: user.email ?? user.id,
      });

      return acc;
    }, []);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid translation entries were provided." },
        { status: 400 }
      );
    }

    const { error } = await supabaseServer.from(TABLE).upsert(rows, {
      onConflict: "namespace,key,locale",
    });

    if (error) throw error;

    return NextResponse.json({ namespace, savedCount: rows.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save translations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
