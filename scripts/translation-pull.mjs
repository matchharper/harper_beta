import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  LANG_DIR,
  PROJECT_ROOT,
  SUPPORTED_LOCALES,
  formatFlatObject,
  replaceTopLevelObjectProperty,
} from "./translationCommon.mjs";
import { rewriteCareerTCalls } from "./translationCareerT.mjs";

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

async function fetchRows(supabase) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(tableName)
      .select("key,locale,value")
      .eq("namespace", namespace)
      .in("locale", SUPPORTED_LOCALES)
      .order("key", { ascending: true })
      .range(from, to);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

const supabase = getSupabaseAdmin();
const rows = await fetchRows(supabase);

if (rows.length === 0) {
  throw new Error(
    "No career translation rows found in DB. Run pnpm translation:push first."
  );
}

const valuesByLocale = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, {}])
);

for (const row of rows) {
  if (!SUPPORTED_LOCALES.includes(row.locale)) continue;
  valuesByLocale[row.locale][row.key] = row.value ?? "";
}

replaceTopLevelObjectProperty({
  exportName: "ko",
  filePath: path.join(LANG_DIR, "ko.ts"),
  propertyName: "career",
  propertyObjectLiteral: formatFlatObject(valuesByLocale.ko),
});
replaceTopLevelObjectProperty({
  exportName: "en",
  filePath: path.join(LANG_DIR, "en.ts"),
  propertyName: "career",
  propertyObjectLiteral: formatFlatObject(valuesByLocale.en),
});

const changedSourceFiles = rewriteCareerTCalls({
  koSourceByKey: new Map(Object.entries(valuesByLocale.ko)),
});

console.log(
  `Pulled ${Object.keys(valuesByLocale.ko).length} ko and ${Object.keys(valuesByLocale.en).length} en ${namespace} keys.`
);
if (changedSourceFiles.length > 0) {
  console.log(
    `Updated ${changedSourceFiles.length} t() Korean fallback source file(s).`
  );
}
