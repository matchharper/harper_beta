import { createClient } from "@supabase/supabase-js";

export const TRANSLATION_NAMESPACE = "career";
export const TRANSLATION_TABLE = "translation_entries";

export function getTranslationSupabaseAdmin(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
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

export async function fetchTranslationRows(
  supabase,
  { namespace = TRANSLATION_NAMESPACE, locales = ["ko", "en"] } = {}
) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(TRANSLATION_TABLE)
      .select("key,locale,value")
      .eq("namespace", namespace)
      .in("locale", locales)
      .order("key", { ascending: true })
      .range(from, to);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

export async function upsertTranslationRows(supabase, rows) {
  const batchSize = 500;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await supabase.from(TRANSLATION_TABLE).upsert(batch, {
      onConflict: "namespace,key,locale",
    });

    if (error) throw error;
    console.log(
      `Uploaded ${Math.min(index + batch.length, rows.length)} / ${rows.length}`
    );
  }
}
