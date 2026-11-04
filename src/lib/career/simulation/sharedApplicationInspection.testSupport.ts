import assert from "node:assert/strict";
import type { SharedInspection } from "./sharedApplicationInspection";

export function inspectionMemoryStore() {
  const rows = new Map<string, SharedInspection>();
  return {
    rows,
    from(table: string) {
      assert.equal(table, "role_application_inspections");
      let roleRef: string;
      const query = {
        upsert: async (values: SharedInspection[]) => {
          for (const row of values) if (!rows.has(row.id)) rows.set(row.id, structuredClone(row));
          return { error: null };
        },
        select: () => query,
        eq: (_key: string, value: string) => { roleRef = value; return query; },
        in: async (_key: string, ids: string[]) => ({ data: [...rows.values()].filter(row => row.role_ref === roleRef && ids.includes(row.id)), error: null }),
      };
      return query;
    },
  };
}
