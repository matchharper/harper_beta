import assert from "node:assert/strict";
import test from "node:test";
import { careerToolCallGroups } from "./concurrentPreparation";

const prepare = (input: Record<string, unknown> = {}) => ({ name: "use_browser", input: { action: "run", task: "Read the form", ...input } });

test("preparation runs for different applications in different browsers run together; everything else runs alone in order", () => {
  // Two preparations for different roles (mode omitted means prepare).
  assert.deepEqual(careerToolCallGroups([prepare({ role_refs: ["a"] }), prepare({ mode: "prepare", role_refs: ["b"], url: "https://jobs.example.test/b" })]), [[0, 1]]);
  // The same browser twice runs one after the other.
  assert.deepEqual(careerToolCallGroups([prepare({ session_id: "s1", role_refs: ["a"] }), prepare({ session_id: "s1", role_refs: ["b"] })]), [[0], [1]]);
  // The same role twice runs one after the other.
  assert.deepEqual(careerToolCallGroups([prepare({ role_refs: ["a", "b"] }), prepare({ role_refs: ["b"] })]), [[0], [1]]);
  // An identical call is the same receipt, never run twice at once.
  assert.deepEqual(careerToolCallGroups([prepare({ url: "https://jobs.example.test/a" }), prepare({ url: "https://jobs.example.test/a" })]), [[0], [1]]);
  // Submission, saved login and documents stay one at a time.
  for (const unsafe of [{ mode: "execute" }, { save_login: true }, { documents: [] }])
    assert.deepEqual(careerToolCallGroups([prepare({ role_refs: ["a"] }), prepare({ role_refs: ["b"], ...unsafe })]), [[0], [1]], JSON.stringify(unsafe));
  // Another tool between them splits the group, and a non-run browser action is not a preparation.
  assert.deepEqual(careerToolCallGroups([prepare({ role_refs: ["a"] }), { name: "read_document", input: {} }, prepare({ role_refs: ["b"] }),
    prepare({ role_refs: ["c"] }), { name: "use_browser", input: { action: "read", session_id: "s1" } }]), [[0], [1], [2, 3], [4]]);
  // Malformed inputs never join a group.
  assert.deepEqual(careerToolCallGroups([prepare({ role_refs: "a" }), prepare({ session_id: 7 }), { name: "use_browser", input: null }]), [[0], [1], [2]]);
});
