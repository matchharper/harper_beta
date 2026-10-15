import assert from "node:assert/strict";
import test from "node:test";
import { generateResume } from "./service";
import { formatToolError } from "@/lib/llm/toolError";

function unavailableSource(error: unknown = null) {
  let writes = 0;
  const admin = {
    from(table: string) {
      const query = {
        select() { return query; }, eq() { return query; },
        insert() { writes++; throw new Error("Resume must not be saved before its sources are verified"); },
        async maybeSingle() { return { data: null, error: table === "talent_documents" ? null : error }; },
      };
      return query;
    },
  };
  return { admin, writes: () => writes };
}

const request = {
  userId: "synthetic-owner", userMessageId: "1",
  input: {
    action: "create", document_name: "Source verification",
    content: { language: "en", basics: { name: "Synthetic candidate" } },
    source_refs: [{ kind: "profile", id: "experience:unverified-id", section: "experience" }],
  },
};

test("an unavailable reference gives a correction path without saving a resume", async () => {
  const state = unavailableSource();
  await assert.rejects(generateResume({ ...request, admin: state.admin as never }), error => {
    const diagnostic = JSON.parse(formatToolError(error));
    assert.match(diagnostic.message, /reference is unavailable/);
    assert.match(diagnostic.message, /profile: experience:unverified-id/);
    assert.match(diagnostic.message, /Re-read the current source/);
    return true;
  });
  assert.equal(state.writes(), 0);
});

test("a source lookup failure is not mislabeled as a missing source", async () => {
  const cause = { code: "08006", message: "connection lost" };
  const state = unavailableSource(cause);
  await assert.rejects(generateResume({ ...request, admin: state.admin as never }), error => {
    const diagnostic = JSON.parse(formatToolError(error));
    assert.match(diagnostic.message, /verification failed/);
    assert.match(diagnostic.message, /not evidence that it is missing/);
    assert.equal(diagnostic.cause.code, cause.code);
    return true;
  });
  assert.equal(state.writes(), 0);
});
