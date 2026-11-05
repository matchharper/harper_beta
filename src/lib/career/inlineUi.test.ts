import assert from "node:assert/strict";
import test from "node:test";
import { formatCareerInlineUiReference, parseCareerInlineUi, readCareerInlineUiReference } from "./inlineUi";

const id = "00000000-0000-4000-8000-000000000001";
const brief = formatCareerInlineUiReference({ type: "brief" });
const matching = formatCareerInlineUiReference({ type: "matching", matchingId: id, runId: id });

test("references retain their position and exact target while text stays separate", () => {
  const parts = parseCareerInlineUi(`먼저 확인해요.\n\n${matching}\n\n조건도 볼게요.\n${brief}\n마지막 설명.`);
  assert.deepEqual(parts.map(part => part.kind), ["text", "ui", "text", "ui", "text"]);
  assert.deepEqual(parts[1], { kind: "ui", reference: { type: "matching", matchingId: id, runId: id }, key: parts[1].key });
  const continued = parseCareerInlineUi(`먼저 확인해요.\n\n${matching}\n\n추가로 스트리밍 중`, true);
  assert.equal(continued[1].key, parts[1].key);
});

test("every incomplete control prefix is withheld without starting a view", () => {
  for (let end = 1; end < matching.length; end++) {
    const parts = parseCareerInlineUi(`설명\n${matching.slice(0, end)}`, true);
    assert.deepEqual(parts.map(part => part.kind), ["text"], `prefix ${end}`);
    assert.equal(parts[0].kind === "text" && parts[0].content, "설명");
  }
  assert.equal(parseCareerInlineUi(matching, true)[0].kind, "ui");
});

test("code, quoted sources, escaped markers and inline examples remain literal", () => {
  for (const content of [`\`\`\`text\n${brief}\n\`\`\``, `~~~\n${brief}\n~~~`, `> ${brief}`, `    ${brief}`, `\t${brief}`, `\`${brief}\``, `\\${brief}`, `예: ${brief}`]) {
    assert.deepEqual(parseCareerInlineUi(content).map(part => part.kind), ["text"]);
  }
});

test("invalid controls never produce references or expose their payload as prose", () => {
  for (const value of ['{"type":"matching","matchingId":"not-an-id"}', '{"type":"html","html":"<script>unsafe</script>"}', '{"type":"opportunities","scope":"sql"}', '{invalid']) {
    assert.equal(parseCareerInlineUi(`[[career_ui:${value}]]`)[0].kind, "invalid");
  }
  assert.equal(parseCareerInlineUi('[[career_ui:{"type":"brief"}', false)[0].kind, "invalid");
});

test("collections have one unambiguous scope and validated, deduplicated identifiers", () => {
  assert.deepEqual(readCareerInlineUiReference({ type: "opportunities", roleIds: [id, id] }), { type: "opportunities", roleIds: [id] });
  assert.equal(readCareerInlineUiReference({ type: "opportunities", roleIds: [id], scope: "saved" }), null);
  assert.equal(readCareerInlineUiReference({ type: "opportunities", roleIds: [] }), null);
  for (const scope of ["all", "saved", "progress"]) assert.deepEqual(readCareerInlineUiReference({ type: "opportunities", scope }), { type: "opportunities", scope });
});


test("workspace references retain valid owned-reader scopes and reject malformed role identifiers", () => {
  for (const type of ["meetings", "automations", "actions"] as const) {
    const reference = { type };
    assert.deepEqual(readCareerInlineUiReference(reference), reference);
    assert.equal(parseCareerInlineUi(formatCareerInlineUiReference(reference))[0].kind, "ui");
  }
  assert.deepEqual(readCareerInlineUiReference({type:"meetings",roleId:id}), {type:"meetings",roleId:id});
  for (const roleId of ["", "another-user", [id], null]) {
    assert.equal(readCareerInlineUiReference({type:"meetings",roleId}), null);
  }
});
