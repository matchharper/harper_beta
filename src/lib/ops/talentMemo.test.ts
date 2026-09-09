import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLatestOpsTalentMemoPreviewMap,
  formatOpsTalentMemoRoleContext,
  type OpsTalentMemoCandidate,
} from "./talentMemo";

function candidate(
  overrides: Partial<OpsTalentMemoCandidate> = {}
): OpsTalentMemoCandidate {
  return {
    companyName: null,
    content: "메모",
    occurredAt: "2026-09-08T00:00:00.000Z",
    roleId: null,
    roleName: null,
    source: "profile",
    talentId: "talent-1",
    ...overrides,
  };
}

test("chooses the newest memo across profile and role sources", () => {
  const latest = buildLatestOpsTalentMemoPreviewMap([
    candidate({
      content: "사람 메모",
      occurredAt: "2026-09-08T01:00:00.000Z",
    }),
    candidate({
      companyName: "Acme",
      content: "Role 메모",
      occurredAt: "2026-09-08T02:00:00.000Z",
      roleId: "role-1",
      roleName: "Backend Engineer",
      source: "role",
    }),
  ]).get("talent-1");

  assert.equal(latest?.content, "Role 메모");
  assert.equal(latest?.source, "role");
  assert.equal(
    latest ? formatOpsTalentMemoRoleContext(latest) : null,
    "Acme · Backend Engineer"
  );
});

test("keeps role context off profile memo previews", () => {
  const latest = buildLatestOpsTalentMemoPreviewMap([
    candidate({ companyName: "ignored", roleName: "ignored" }),
  ]).get("talent-1");

  assert.equal(
    latest ? formatOpsTalentMemoRoleContext(latest) : "missing",
    null
  );
});

test("normalizes content and ignores empty candidates", () => {
  const latest = buildLatestOpsTalentMemoPreviewMap([
    candidate({ content: "   ", occurredAt: "2026-09-08T03:00:00.000Z" }),
    candidate({ content: `  ${"a".repeat(260)}  ` }),
  ]).get("talent-1");

  assert.equal(latest?.content.length, 240);
  assert.equal(latest?.content, "a".repeat(240));
});
