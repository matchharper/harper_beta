import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  LANG_DIR,
  PROJECT_ROOT,
  SUPPORTED_LOCALES,
  formatFlatObject,
  readTopLevelStringObjectProperty,
  replaceTopLevelObjectProperty,
} from "./translationCommon.mjs";
import {
  extractCareerTCalls,
  generateCareerTranslationKey,
  rewriteCareerTCalls,
} from "./translationCareerT.mjs";

dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const namespace = "career";
const tableName = "translation_entries";
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const shouldPushDb = args.has("--push-db");
const shouldTranslate = args.has("--translate");
const shouldRemoveSyncOptions = !args.has("--keep-sync-options");

function readCareerValues(exportName) {
  return readTopLevelStringObjectProperty({
    exportName,
    filePath: path.join(LANG_DIR, `${exportName}.ts`),
    propertyName: "career",
  });
}

function getCallIdentity(call) {
  return `${call.filePath}:${call.nodeStart}`;
}

function assertSupportedLocales() {
  if (!SUPPORTED_LOCALES.includes("ko") || !SUPPORTED_LOCALES.includes("en")) {
    throw new Error("translation:sync currently requires ko and en locales.");
  }
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function upsertRows(rows) {
  if (rows.length === 0) return;
  const supabase = getSupabaseAdmin();
  const batchSize = 500;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await supabase.from(tableName).upsert(batch, {
      onConflict: "namespace,key,locale",
    });
    if (error) throw error;
    console.log(
      `Uploaded ${Math.min(index + batch.length, rows.length)} / ${rows.length}`
    );
  }
}

function parseJsonObject(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start)
      return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Model response did not contain a JSON object.");
  }
}

function extractPlaceholders(value) {
  return Array.from(value.matchAll(/\{([a-zA-Z0-9_]+)\}/g))
    .map((match) => match[1])
    .sort();
}

function placeholdersMatch(koValue, enValue) {
  const koPlaceholders = extractPlaceholders(koValue);
  const enPlaceholders = extractPlaceholders(enValue);
  return (
    koPlaceholders.length === enPlaceholders.length &&
    koPlaceholders.every(
      (placeholder, index) => placeholder === enPlaceholders[index]
    )
  );
}

async function translateEnglish(entries) {
  if (entries.length === 0) return {};
  if (!shouldTranslate) return {};
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY for --translate.");
  }

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const translations = {};
  const batchSize = 30;
  const models = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ];

  async function generateBatch(payload) {
    let lastError = null;
    const guide = [
      "You are the localization engine for Harper, an AI career agent product.",
      "Translate Korean product strings into English as if writing native English product UI.",
      "Classify conversational Harper messages separately from product UI.",
      "For conversational strings, Harper speaks in first person: I will, I'll, you and I.",
      "For product UI/system text, refer to Harper in third person and use you/your for the user.",
      "Keep the tone friendly, professional, concise, and natural.",
      "Preserve Harper, named entities, placeholders like {count}, markup, and line breaks exactly.",
      "Return only a JSON object with the same keys and English string values.",
    ].join("\n");

    for (const model of models) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          return await ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `${guide}\n\n${JSON.stringify(payload, null, 2)}`,
                  },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          });
        } catch (error) {
          lastError = error;
          const waitMs = 800 * (attempt + 1) * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }

    throw lastError ?? new Error("Translation request failed.");
  }

  for (let index = 0; index < entries.length; index += batchSize) {
    const batch = entries.slice(index, index + batchSize);
    const payload = Object.fromEntries(
      batch.map((entry) => [entry.key, entry.ko])
    );
    const response = await generateBatch(payload);
    Object.assign(translations, parseJsonObject(response.text ?? "{}"));
    console.log(
      `Translated ${Math.min(index + batch.length, entries.length)} / ${entries.length}`
    );
  }

  return translations;
}

function collectExplicitEntries({ calls, existingKeys }) {
  const entries = new Map();
  const keyRewrites = new Map();
  const claimedKeys = new Set(existingKeys);
  const conflicts = [];

  for (const call of calls) {
    let key = call.key;
    if (key === "new") {
      key = generateCareerTranslationKey({
        existingKeys: claimedKeys,
        koSource: call.koSource,
        relPath: path.relative(PROJECT_ROOT, call.filePath),
      });
      keyRewrites.set(getCallIdentity(call), key);
      claimedKeys.add(key);
    }

    const current = entries.get(key);
    if (current && current.ko !== call.koSource) {
      conflicts.push({ current, key, next: call });
      continue;
    }

    if (!current) {
      entries.set(key, {
        key,
        ko: call.koSource,
        locations: [call.location],
        retranslate: call.retranslate,
      });
      continue;
    }

    current.locations.push(call.location);
    current.retranslate ||= call.retranslate;
  }

  if (conflicts.length > 0) {
    const details = conflicts
      .slice(0, 10)
      .map(
        ({ current, key, next }) =>
          `- ${key}: ${current.locations[0]}=${JSON.stringify(
            current.ko
          )}, ${next.location}=${JSON.stringify(next.koSource)}`
      )
      .join("\n");
    throw new Error(`Conflicting t() Korean sources:\n${details}`);
  }

  return { entries: Array.from(entries.values()), keyRewrites };
}

assertSupportedLocales();

const calls = extractCareerTCalls();
const existingKo = readCareerValues("ko");
const existingEn = readCareerValues("en");
const existingKeys = new Set([
  ...Object.keys(existingKo),
  ...Object.keys(existingEn),
  ...calls.filter((call) => call.key !== "new").map((call) => call.key),
]);
const { entries, keyRewrites } = collectExplicitEntries({
  calls,
  existingKeys,
});
const englishRequests = [];
const touchedKeys = new Set();

const nextKo = { ...existingKo };
const nextEn = { ...existingEn };

for (const entry of entries) {
  const previousKo = existingKo[entry.key];
  const previousEn = existingEn[entry.key];
  const koChanged = previousKo !== entry.ko;
  const isNew = previousKo === undefined && previousEn === undefined;

  if (koChanged) {
    nextKo[entry.key] = entry.ko;
    touchedKeys.add(entry.key);
  }

  if (isNew || !previousEn || entry.retranslate) {
    englishRequests.push(entry);
    touchedKeys.add(entry.key);
  }
}

const translatedEn = await translateEnglish(englishRequests);

for (const entry of englishRequests) {
  const nextValue =
    translatedEn[entry.key] ?? existingEn[entry.key] ?? entry.ko;
  if (!placeholdersMatch(entry.ko, nextValue)) {
    throw new Error(
      `Placeholder mismatch after translation for ${entry.key}: ko=${extractPlaceholders(
        entry.ko
      ).join(",")} en=${extractPlaceholders(nextValue).join(",")}`
    );
  }
  nextEn[entry.key] = nextValue;
}

const changedSourceFiles = dryRun
  ? []
  : rewriteCareerTCalls({
      keyRewrites,
      koSourceByKey: new Map(),
      removeSyncOnlyOptions: shouldRemoveSyncOptions,
    });

if (!dryRun) {
  replaceTopLevelObjectProperty({
    exportName: "ko",
    filePath: path.join(LANG_DIR, "ko.ts"),
    propertyName: "career",
    propertyObjectLiteral: formatFlatObject(nextKo),
  });
  replaceTopLevelObjectProperty({
    exportName: "en",
    filePath: path.join(LANG_DIR, "en.ts"),
    propertyName: "career",
    propertyObjectLiteral: formatFlatObject(nextEn),
  });
}

const dbRows = Array.from(touchedKeys).flatMap((key) =>
  SUPPORTED_LOCALES.flatMap((locale) => {
    const value = locale === "ko" ? nextKo[key] : nextEn[key];
    if (typeof value !== "string") return [];
    return {
      description: null,
      key,
      locale,
      namespace,
      status: locale === "ko" ? "reviewed" : "draft",
      updated_by: "translation:sync",
      value,
    };
  })
);

if (!dryRun && shouldPushDb) {
  await upsertRows(dbRows);
}

const summary = {
  changedSourceFiles: changedSourceFiles.map((filePath) =>
    path.relative(PROJECT_ROOT, filePath)
  ),
  explicitCallCount: calls.length,
  newKeyCount: keyRewrites.size,
  pushedDbRows: !dryRun && shouldPushDb ? dbRows.length : 0,
  retranslatedCount: englishRequests.filter((entry) => entry.retranslate)
    .length,
  touchedKeys: Array.from(touchedKeys).sort(),
};

console.log(JSON.stringify(summary, null, 2));
