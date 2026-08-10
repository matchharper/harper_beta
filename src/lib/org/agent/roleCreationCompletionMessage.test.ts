import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoleCreationCompletionMessage,
  splitRoleCreationCompletionSentences,
} from "@/lib/org/agent/roleCreationCompletionMessage";

test("builds a fixed three-paragraph completion guide with role context", () => {
  const message = buildRoleCreationCompletionMessage({
    companyName: "Harper",
    roleName: "Founding Designer",
    userName: "민지",
  });

  assert.equal(message.split("\n\n").length, 3);
  assert.match(message, /민지님/);
  assert.match(message, /Harper/);
  assert.match(message, /Founding Designer/);
  assert.match(message, /곧바로 회사에 공유하지 않고/);
  assert.match(message, /임의로 수락이나 거절로 판단하지 않기 때문에/);
});

test("splits completion copy by whole sentences while preserving paragraphs", () => {
  const message = buildRoleCreationCompletionMessage({
    companyName: "Harper",
    roleName: "Founding Designer",
    userName: "민지",
  });
  const chunks = splitRoleCreationCompletionSentences(message);

  assert.ok(chunks.length >= 9);
  assert.equal(chunks.join(""), message);
  assert.ok(chunks.some((chunk) => chunk.endsWith("\n\n")));
});
