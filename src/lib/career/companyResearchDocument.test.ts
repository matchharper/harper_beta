import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { saveCompanyResearchDocument } from "./companyResearchDocument";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";

function createStore() {
  const rows: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "talent_documents");
      const filters: Array<[string, unknown]> = [];
      let pending: Record<string, unknown> | null = null;
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        insert(row: Record<string, unknown>) {
          pending = row;
          return query;
        },
        async maybeSingle() {
          return {
            data:
              rows.find((row) =>
                filters.every(([key, value]) => row[key] === value)
              ) ?? null,
            error: null,
          };
        },
        async single() {
          assert.ok(pending);
          if (rows.some((row) => row.id === pending!.id))
            return { data: null, error: { code: "23505" } };
          rows.push(pending);
          return { data: pending, error: null };
        },
      };
      return query;
    },
  } as unknown as TalentAdminClient;
  return { admin, rows };
}

test("saves exact private Markdown, isolates readers and reuses identical reports", async () => {
  const { admin, rows } = createStore();
  const args = {
    admin,
    userId: "reader-a",
    snapshotId: "shared-snapshot",
    title: "합류 검토.md",
    markdown: "# 회사\n\n서연님의 선호기준\n\n- ⚠️ 온콜",
  };
  const first = await saveCompanyResearchDocument(args);
  assert.deepEqual(await saveCompanyResearchDocument(args), first);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_public, false);
  assert.equal(rows[0].is_primary, false);
  assert.equal(rows[0].extracted_text, args.markdown);
  assert.equal(rows[0].content_type, "text/markdown");
  assert.equal(
    await fetchTalentDocument({
      admin,
      documentId: first.id,
      userId: "reader-b",
    }),
    null
  );
  const second = await saveCompanyResearchDocument({
    ...args,
    userId: "reader-b",
  });
  assert.notEqual(second.id, first.id);
  const revised = await saveCompanyResearchDocument({
    ...args,
    markdown: "새 선호기준으로 판단",
  });
  assert.notEqual(revised.id, first.id);
  assert.equal(rows[0].extracted_text, args.markdown);
});

test("a deleted report remains deleted when a new copy is requested", async () => {
  const { admin, rows } = createStore();
  const args = {
    admin,
    userId: "reader",
    snapshotId: "snapshot",
    title: "회사.md",
    markdown: "보고서",
  };
  const first = await saveCompanyResearchDocument(args);
  rows[0].is_deleted = true;
  assert.equal(
    await fetchTalentDocument({
      admin,
      documentId: first.id,
      userId: args.userId,
    }),
    null
  );
  const next = await saveCompanyResearchDocument(args);
  assert.notEqual(first.id, next.id);
  assert.equal(rows[0].is_deleted, true);
});

test("concurrent saves return the same document without duplicate rows", async () => {
  const { admin, rows } = createStore();
  const args = {
    admin,
    userId: "reader",
    snapshotId: "snapshot",
    title: "회사.md",
    markdown: "보고서",
  };
  const [first, second] = await Promise.all([
    saveCompanyResearchDocument(args),
    saveCompanyResearchDocument(args),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(rows.length, 1);
});
