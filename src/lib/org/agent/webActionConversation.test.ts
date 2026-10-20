import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chooseWebActionConversation } from "./webActionConversation";

const roleConversation = { id: "designer-log", role_id: "designer", title: "Designer" };

test("keeps the Role conversation when the company asked from another Role's thread", () => {
  assert.deepEqual(
    chooseWebActionConversation(roleConversation, { id: "researcher-log", role_id: "researcher" }, "designer"),
    roleConversation
  );
});

test("uses the source conversation when it is workspace-wide or the same Role", () => {
  assert.deepEqual(
    chooseWebActionConversation(roleConversation, { id: "workspace", role_id: null }, "designer"),
    { ...roleConversation, id: "workspace", role_id: null }
  );
  assert.deepEqual(
    chooseWebActionConversation(roleConversation, { id: "designer-thread", role_id: "designer" }, "designer"),
    { ...roleConversation, id: "designer-thread", role_id: "designer" }
  );
});

test("keeps the Role conversation without a source conversation", () => {
  assert.deepEqual(chooseWebActionConversation(roleConversation, null, "designer"), roleConversation);
});

test("the company event enqueue routes the source conversation through this choice", () => {
  const turn = readFileSync(new URL("./webActionTurn.ts", import.meta.url), "utf8");
  assert.match(turn, /chooseWebActionConversation\(conversation, data, roleId\)/);
  assert.doesNotMatch(turn, /conversation Role mismatch/);
});
