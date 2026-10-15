import assert from "node:assert/strict";
import type { TalentAdminClient } from "../../src/lib/talentOnboarding/admin";
import type { SessionRecord } from "../../src/lib/career/simulation/sessionStore";
import type { TalentDocumentRow } from "../../src/lib/talentOnboarding/models";

// Test-only storage. Runtime document reads/writes and session serialization run
// unchanged, but nothing can reach a database or a real applicant's records.
export function applicationPreparationEvalStore(
  record: SessionRecord,
  source: TalentDocumentRow,
  fixtureRows: Record<string, Record<string, unknown>[]> = {}
) {
  let current = record;
  const docs = new Map<string, TalentDocumentRow>([
    [source.id, structuredClone(source)],
  ]);
  const userId = source.talent_id;
  const admin = {
    from(table: string) {
      assert.ok(
        table === "talent_documents" || table in fixtureRows,
        "Only explicitly supplied synthetic tables are available"
      );
      const filters: Record<string, unknown> = {};
      let operation = "read",
        value: any;
      const q = {
        select: () => q,
        limit: () => q,
        eq: (key: string, v: unknown) => {
          filters[key] = v;
          return q;
        },
        insert: (v: any) => {
          operation = "insert";
          value = v;
          return q;
        },
        update: (v: any) => {
          operation = "update";
          value = v;
          return q;
        },
        maybeSingle: async () => {
          if (table !== "talent_documents") {
            assert.equal(
              operation,
              "read",
              "Supporting fixture rows are read-only"
            );
            assert.equal(
              filters.talent_id ?? filters.user_id,
              userId,
              "References must be owner-scoped"
            );
            const row = fixtureRows[table].find((row) =>
              Object.entries(filters).every(
                ([key, value]) =>
                  row[key] === value || String(row[key]) === String(value)
              )
            );
            return { data: row ? structuredClone(row) : null, error: null };
          }
          if (operation === "insert") {
            assert.equal(value.talent_id, userId);
            if (docs.has(value.id))
              return { data: null, error: { code: "23505" } };
            docs.set(value.id, { is_deleted: false, ...value });
            return { data: structuredClone(docs.get(value.id)), error: null };
          }
          assert.equal(
            filters.talent_id,
            userId,
            "Reads and updates must be owner-scoped"
          );
          const row = [...docs.values()].find((d) =>
            Object.entries(filters).every(([k, v]) => (d as any)[k] === v)
          );
          if (row && operation === "update")
            Object.assign(row, value, { revision: row.revision + 1 });
          return { data: row ? structuredClone(row) : null, error: null };
        },
      };
      return q;
    },
    async rpc(_name: string, args: any) {
      assert.equal(args.p_user_id, userId);
      if (args.p_payload) {
        assert.equal(args.p_revision, current.state.revision);
        current = {
          messageId: 10,
          state: {
            ...structuredClone(args.p_payload),
            revision: current.state.revision + 1,
          },
        };
      }
      return {
        data: {
          message_id: 10,
          payload: current.state,
          created_at: current.state.startedAt,
        },
        error: null,
      };
    },
  } as unknown as TalentAdminClient;
  return {
    store: { admin, userId, conversationId: "synthetic-conversation" },
    docs,
    setRecord: (next: SessionRecord) => {
      current = next;
    },
    get record() {
      return current;
    },
  };
}
