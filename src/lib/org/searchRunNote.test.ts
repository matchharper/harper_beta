import assert from "node:assert/strict";
import test from "node:test";
import {
  readSearchRunNotes,
  SEARCH_RUN_NOTE_MAX,
  searchRunNoteFromReply,
} from "./searchRunNote";

/** A read-only stand-in for the admin client: each table returns its rows. */
function fakeAdmin(tables: Record<string, Array<Record<string, unknown>>>) {
  const calls: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
  const admin = {
    from(table: string) {
      const call = { table, filters: [] as Array<[string, string, unknown]> };
      calls.push(call);
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => (call.filters.push(["eq", column, value]), builder),
        in: (column: string, value: unknown) => (call.filters.push(["in", column, value]), builder),
        then: (resolve: (value: unknown) => void) => {
          const data = (tables[table] ?? []).filter((row) =>
            call.filters.every(([op, column, value]) =>
              op === "eq"
                ? row[column] === value
                : (value as unknown[]).includes(row[column])
            )
          );
          resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
  return { admin: admin as any, calls };
}

test("a search's result line is the first line Harper wrote, plain and short", () => {
  assert.equal(searchRunNoteFromReply(""), null);
  assert.equal(searchRunNoteFromReply("  \n\n "), null);
  assert.equal(
    searchRunNoteFromReply(
      "\n*이번 검색에서는 기준에 맞는 분이 없었어요.* 다음 검색에서 경력 조건을 넓혀 볼게요.\n- 자세한 내용"
    ),
    "이번 검색에서는 기준에 맞는 분이 없었어요. 다음 검색에서 경력 조건을 넓혀 볼게요."
  );
  assert.equal(
    searchRunNoteFromReply("> <https://example.invalid/x|3명>을 넣었어요"),
    "3명을 넣었어요"
  );
  const long = searchRunNoteFromReply("가".repeat(400))!;
  assert.equal(Array.from(long).length, SEARCH_RUN_NOTE_MAX);
  assert.ok(long.endsWith("…"));
});

test("each search gets the message Harper sent from its hand-back, and only that", async () => {
  const { admin } = fakeAdmin({
    company_agent_web_action_jobs: [
      { id: "j1", action_name: "scheduled_matching_review", status: "completed_message", terminal_message_id: 11 },
      // Harper stayed silent: no message, so the fixed line stays.
      { id: "j2", action_name: "scheduled_matching_review", status: "completed_silent", terminal_message_id: null },
      // Another kind of job is never read as a search result.
      { id: "j3", action_name: "company_update", status: "completed_message", terminal_message_id: 12 },
    ],
    company_messages: [
      { id: 11, role: "assistant", content: "새 후보 2명을 연결을 요청할 후보에 넣었어요.\n이어서…" },
      { id: 12, role: "assistant", content: "다른 메시지" },
    ],
  });
  const notes = await readSearchRunNotes(admin, [
    { id: "r1", continuation_job_id: "j1" },
    { id: "r2", continuation_job_id: "j2" },
    { id: "r3", continuation_job_id: "j3" },
    { id: "r4", continuation_job_id: null },
  ]);
  assert.deepEqual([...notes], [["r1", "새 후보 2명을 연결을 요청할 후보에 넣었어요."]]);
});

test("no hand-back yet: nothing is read", async () => {
  const { admin, calls } = fakeAdmin({});
  const notes = await readSearchRunNotes(admin, [{ id: "r1", continuation_job_id: null }]);
  assert.equal(notes.size, 0);
  assert.equal(calls.length, 0);
});

test("the To-do shows Harper's line for a finished search, the fixed line otherwise", async () => {
  const { orgTodoItemText } = await import("@/components/org/OrgTodoChip");
  const c = (ko: string, _en: string, values?: Record<string, string | number>) =>
    ko.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? ""));
  const base = { id: "search:r1", column: "done", kind: "search_done", at: null } as const;
  assert.equal(
    orgTodoItemText({ ...base, count: 0, note: "기준에 맞는 분이 없어 내일 다시 찾아볼게요." }, c, "ko"),
    "기준에 맞는 분이 없어 내일 다시 찾아볼게요."
  );
  assert.equal(orgTodoItemText({ ...base, count: 0 }, c, "ko"), "후보 검색을 마쳤어요");
  assert.equal(
    orgTodoItemText({ ...base, count: 3, note: null }, c, "ko"),
    "후보 검색 · 연결을 요청할 후보 3명 추가"
  );
});
