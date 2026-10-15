import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

/** Per-session public document cache. Never connects to a database. */
export function createMemoryDocumentCache() {
  const documents = new Map<string, Record<string, any>>();
  let sequence = 0;
  const admin = {
    from(table: string) {
      if (table !== "documents") throw new Error("Only public document caching is supported");
      let urls: string[] | null = null;
      let id: unknown;
      let pending: Record<string, any> | undefined;
      const query = {
        select() { return query; },
        in(key: string, values: string[]) {
          if (key !== "url") throw new Error("Unsupported document lookup");
          urls = values; return query;
        },
        eq(key: string, value: unknown) {
          if (key === "url") urls = [String(value)];
          else if (key === "id") id = value;
          else throw new Error("Unsupported document lookup");
          return query;
        },
        order() { return query; },
        limit() { return query; },
        insert(row: Record<string, any>) { pending = row; return query; },
        update(row: Record<string, any>) { pending = row; return query; },
        async maybeSingle() {
          const rows = [...documents.values()].filter(row => (!urls || urls.includes(row.url)) && (id === undefined || row.id === id));
          rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
          return { data: rows[0] ?? null, error: null };
        },
        async single() {
          if (!pending?.url || !pending.markdown) throw new Error("Document contents required");
          const existing = documents.get(pending.url);
          if (id !== undefined && existing?.id !== id) throw new Error("Document cache revision target changed");
          const row: Record<string, any> = { ...pending, id: existing?.id ?? ++sequence };
          documents.set(row.url, row);
          return { data: row, error: null };
        },
      };
      return query;
    },
  };
  return { admin: admin as unknown as TalentAdminClient, snapshot: () => structuredClone([...documents.values()]) };
}
