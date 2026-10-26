import assert from "node:assert/strict";
import test from "node:test";
import { orgTalentReferenceHref, readOrgTalentReferenceHref, remarkOrgTalentReferences, splitOrgTalentReferences } from "./talentReference";

const talentId = "a1234567-1234-1234-1234-123456789abc";
const otherId = "b1234567-1234-1234-1234-123456789abc";

test("raw IDs, talent markers and named mentions share one reference contract", () => {
  const source = `비교: ${talentId}, talent:${otherId}\n@[첫 후보](talent:${talentId})`;
  const parts = splitOrgTalentReferences(source);
  assert.equal(parts.map(part => part.text).join(""), source);
  assert.deepEqual(parts.flatMap(part => part.reference ? [part.reference] : []), [
    { talentId, label: null }, { talentId: otherId, label: null }, { talentId, label: "첫 후보" },
  ]);
  assert.equal(splitOrgTalentReferences("회사 역할 설명").length, 1);
  assert.ok(!splitOrgTalentReferences(`prefix${talentId}`).some(part => part.reference));
});

test("candidate links retain their Role and cannot resolve another workspace or external host", () => {
  const href = orgTalentReferenceHref({ talentId, workspaceId: "workspace", roleId: "role" });
  assert.deepEqual(readOrgTalentReferenceHref(href, "workspace"), { talentId, roleId: "role", recommendationId: null });
  assert.equal(readOrgTalentReferenceHref(href, "other-workspace"), null);
  assert.equal(readOrgTalentReferenceHref(href.replace("matchharper.com", "other.example"), "workspace"), null);
  assert.equal(new URL(href).searchParams.get("tab"), null, "navigation must not force a pipeline tab");
});

test("Markdown references work inside paragraphs, tables and inline code without corrupting links or code blocks", () => {
  const tree = { type: "root", children: [
    { type: "paragraph", children: [{ type: "text", value: talentId }] },
    { type: "tableCell", children: [{ type: "inlineCode", value: `talent:${otherId}` }] },
    { type: "link", url: `https://example.com/${talentId}`, children: [{ type: "text", value: talentId }] },
    { type: "code", value: talentId },
  ] };
  remarkOrgTalentReferences({ workspaceId: "workspace", roleId: "role" })(tree);
  assert.equal(tree.children[0].children?.[0].type, "link");
  assert.equal(tree.children[1].children?.[0].type, "link");
  assert.equal(tree.children[2].url, `https://example.com/${talentId}`);
  assert.equal(tree.children[2].children?.[0].type, "text");
  assert.equal(tree.children[3].type, "code");
});
