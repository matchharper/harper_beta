import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompanyEventContent,
  getCompanyEventActorLabel,
  getCompanyEventActorLabelFromUser,
  type CompanyEventInsertClient,
  writeCompanyEvent,
} from "./companyEvents";

test("formats a compact single-line website change", () => {
  assert.equal(
    buildCompanyEventContent({
      actorLabel: "김호진",
      changes: [{ after: 2021, before: 2020, key: "founded_year" }],
    }),
    "김호진 · founded_year: - 2020 + 2021"
  );
});

test("skips no-op changes after normalizing object key order", () => {
  assert.equal(
    buildCompanyEventContent({
      actorLabel: "김호진",
      changes: [
        {
          after: { end: 20, start: 10 },
          before: { start: 10, end: 20 },
          key: "employee_count_range",
        },
      ],
    }),
    null
  );
});

test("sanitizes newlines and keeps the event within the database limit", () => {
  const content = buildCompanyEventContent({
    actorLabel: "김\n호진",
    changes: Array.from({ length: 8 }, (_, index) => ({
      after: `새 값 ${index} `.repeat(30),
      before: `기존 값 ${index} `.repeat(30),
      key: `field_${index}`,
    })),
  });

  assert.ok(content);
  assert.equal(content.includes("\n"), false);
  assert.ok(Array.from(content).length <= 300);
  assert.match(content, /외 \d+개$/);
});

test("uses the email and then a Korean fallback for missing actor names", () => {
  assert.equal(
    getCompanyEventActorLabel({ email: "recruiter@example.com" }),
    "recruiter@example.com"
  );
  assert.equal(getCompanyEventActorLabel({}), "회사 사용자");
  assert.equal(
    getCompanyEventActorLabelFromUser({
      email: "fallback@example.com",
      user_metadata: { full_name: "채용 담당자" },
    }),
    "채용 담당자"
  );
  assert.equal(
    getCompanyEventActorLabelFromUser({
      email: "fallback@example.com",
      user_metadata: { full_name: "  ", name: "담당자" },
    }),
    "담당자"
  );
});

test("writes exactly one row for a real change and none for a no-op", async () => {
  const rows: unknown[] = [];
  const client: CompanyEventInsertClient = {
    from(table) {
      assert.equal(table, "company_events");
      return {
        async insert(row) {
          rows.push(row);
          return { error: null };
        },
      };
    },
  };

  const written = await writeCompanyEvent({
    actorLabel: "김호진",
    changes: [{ after: "new", before: "old", key: "pitch" }],
    client,
    source: "website",
    workspaceId: "workspace-1",
  });
  const skipped = await writeCompanyEvent({
    actorLabel: "김호진",
    changes: [{ after: "same", before: "same", key: "pitch" }],
    client,
    source: "website",
    workspaceId: "workspace-1",
  });

  assert.equal(written.recorded, true);
  assert.equal(skipped.recorded, false);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    content: '김호진 · pitch: - "old" + "new"',
    source: "website",
    workspace_id: "workspace-1",
  });
});
