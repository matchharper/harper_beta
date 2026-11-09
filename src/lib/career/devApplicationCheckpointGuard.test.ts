import test from "node:test";
import assert from "node:assert/strict";
import { assertApplicationOperationsQuiescent as check } from "./devApplicationCheckpointGuard";
const operation = (kind: string, status = "completed") => ({
  id: kind,
  kind,
  status,
});
test("completed preparation can be rewound, but executed or uncertain external effects cannot", () => {
  check(
    [
      operation("career_invocation"),
      operation("browser_run"),
      operation("browser_session", "closed"),
      operation("pdf_artifact", "ready"),
      operation("attachment_snapshot", "ready"),
      operation("career_follow_mutation"),
    ],
    []
  );
  for (const kind of [
    "work_effect",
    "gmail_send",
    "unknown_external_operation",
  ])
    assert.throws(() => check([operation(kind)], []), /외부 실행/);
  const receipt = operation("work_effect");
  check([receipt], [receipt]);
  assert.throws(
    () => check([{ ...receipt, status: "failed" }], [receipt]),
    /외부 실행/
  );
  assert.throws(() => check([], [receipt]), /기준 실행 기록/);
  assert.throws(() => check([operation("attachment_snapshot", "reserved")], []), /외부 실행/);
});
test("a completed internal follow receipt is reversible without permitting delivery or unfinished mutations", () => {
  check([operation("career_follow_mutation")], []);
  for (const status of ["reserved", "running", "failed"])
    assert.throws(() => check([operation("career_follow_mutation", status)], []), /외부 실행/);
  assert.throws(() => check([operation("career_follow_mutation"), operation("gmail_send")], []), /외부 실행/);
  assert.throws(() => check([operation("career_follow_mutation"), operation("work_effect")], []), /외부 실행/);
});
test("active runs and human-controlled sessions prevent rewind", () => {
  for (const kind of [
    "career_invocation",
    "career_dependency",
    "delegated_work",
    "browser_run",
  ])
    assert.throws(() => check([operation(kind, "running")], []), /진행 중/);
  assert.throws(
    () => check([operation("browser_session", "idle")], []),
    /브라우저/
  );
  assert.throws(
    () =>
      check(
        [
          {
            ...operation("browser_session", "closed"),
            result: { control_source: "user" },
          },
        ],
        []
      ),
    /직접 조작/
  );
});
