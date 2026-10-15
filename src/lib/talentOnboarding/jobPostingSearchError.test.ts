import assert from "node:assert/strict";
import test from "node:test";
import { RoleSqlExecutionError } from "./jobPostingSearchError";
import { formatToolError, serializeToolResultForModel } from "@/lib/llm/toolError";

test("timed-out searches retain private SQL for recovery but deliver only the error and outcome to the model", () => {
  const sql = "select private_candidate_context from private_source";
  const error = new RoleSqlExecutionError({ message: "canceling statement due to statement timeout", code: "57014", sql });
  assert.equal(error.sql, sql);
  assert.equal(error.timedOut, true);
  const diagnostic = JSON.parse(formatToolError(error));
  assert.equal(diagnostic.code, "57014");
  assert.match(diagnostic.recovery, /not an empty search result/);
  assert.match(diagnostic.recovery, /No new recommendations were saved/);
  assert.ok(!serializeToolResultForModel(error).includes(sql));
});

test("non-timeout query failures do not claim a timeout or no matching jobs", () => {
  const error = new RoleSqlExecutionError({ message: "syntax error", code: "42601", sql: "invalid SQL" });
  assert.equal(error.timedOut, false);
  const diagnostic = JSON.parse(formatToolError(error));
  assert.equal(diagnostic.code, "42601");
  assert.match(diagnostic.recovery, /query failed/);
  assert.ok(!diagnostic.recovery.includes("exceeded its time limit"));
});
