import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  LANG_DIR,
  PROJECT_ROOT,
  SUPPORTED_LOCALES,
  readTopLevelStringObjectProperty,
} from "./translationCommon.mjs";

dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const namespace = "career";
const tableName = "translation_entries";

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

async function upsertInBatches(supabase, rows) {
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

const valuesByLocale = {
  en: readTopLevelStringObjectProperty({
    exportName: "en",
    filePath: path.join(LANG_DIR, "en.ts"),
    propertyName: "career",
  }),
  ko: readTopLevelStringObjectProperty({
    exportName: "ko",
    filePath: path.join(LANG_DIR, "ko.ts"),
    propertyName: "career",
  }),
};
const keys = Array.from(
  new Set(
    SUPPORTED_LOCALES.flatMap((locale) =>
      Object.keys(valuesByLocale[locale] ?? {})
    )
  )
).sort();

const rows = [];
for (const key of keys) {
  for (const locale of SUPPORTED_LOCALES) {
    const value = valuesByLocale[locale]?.[key];
    if (typeof value !== "string") continue;

    rows.push({
      namespace,
      key,
      locale,
      value,
      status: locale === "ko" ? "reviewed" : "draft",
      description: null,
      updated_by: "translation:push",
    });
  }
}

if (rows.length === 0) {
  throw new Error(
    "No career translations found in src/lang/en.ts or src/lang/ko.ts."
  );
}

const supabase = getSupabaseAdmin();
await upsertInBatches(supabase, rows);
console.log(
  `Uploaded ${keys.length} ${namespace} keys for ${SUPPORTED_LOCALES.join(", ")}.`
);
