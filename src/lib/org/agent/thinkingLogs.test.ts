import assert from "node:assert/strict";
import test from "node:test";
import type { OrgAgentThinkingLog } from "@/lib/org/agent/types";
import {
  compactOrgAgentThinkingLogs,
  finalizeOrgAgentThinkingLogs,
  getOrgAgentThinkingLogIcon,
  hasOrgAgentToolWork,
  localizeOrgAgentThinkingLogs,
  orgAgentLiveStatusLabel,
  orgAgentToolTarget,
  upsertOrgAgentThinkingLog,
} from "@/lib/org/agent/thinkingLogs";

test("English org screens localize saved tool progress without changing the record", () => {
  const logs: OrgAgentThinkingLog[] = [{
    at: "2026-09-28T00:00:00.000Z",
    icon: "search",
    id: "call-1",
    label: "웹 검색 완료",
    status: "done",
  }];
  assert.equal(localizeOrgAgentThinkingLogs(logs, "en")[0]?.label, "Looked around");
  assert.equal(localizeOrgAgentThinkingLogs(logs, "ko"), logs);
  assert.equal(logs[0]?.label, "웹 검색 완료");
});

test("removes response generation from the saved terminal working log", () => {
  const logs: OrgAgentThinkingLog[] = [
    {
      at: "2026-08-14T00:00:00.000Z",
      id: "context",
      label: "회사와 최근 추천 정보 확인 완료",
      status: "done",
    },
    {
      at: "2026-08-14T00:00:01.000Z",
      id: "response",
      label: "응답 생성 중",
      status: "running",
    },
    {
      at: "2026-08-14T00:00:02.000Z",
      id: "call-1",
      label: "후보자 확인 완료",
      status: "done",
    },
  ];

  assert.deepEqual(
    finalizeOrgAgentThinkingLogs(logs, true).map((log) => log.id),
    ["context", "call-1"]
  );
  assert.deepEqual(finalizeOrgAgentThinkingLogs(logs, false), []);
});

test("distinguishes model preparation logs from actual tool work", () => {
  assert.equal(
    hasOrgAgentToolWork([
      {
        at: "2026-08-14T00:00:00.000Z",
        id: "context",
        label: "회사와 최근 추천 정보를 읽는 중",
        status: "running",
      },
      {
        at: "2026-08-14T00:00:01.000Z",
        id: "response",
        label: "응답 생성 중",
        status: "running",
      },
    ]),
    false
  );
  assert.equal(
    hasOrgAgentToolWork([
      {
        at: "2026-08-14T00:00:02.000Z",
        id: "call-1",
        label: "역할 정보 확인 중",
        status: "running",
      },
    ]),
    true
  );
});

test("groups tool icons by user-visible operation", () => {
  assert.equal(getOrgAgentThinkingLogIcon("web_search"), "search");
  assert.equal(getOrgAgentThinkingLogIcon("open_url"), "link");
  assert.equal(getOrgAgentThinkingLogIcon("read_role"), "read");
  assert.equal(getOrgAgentThinkingLogIcon("update_role_criteria"), "write");
  assert.equal(
    getOrgAgentThinkingLogIcon("manage_interview_availability"),
    "write"
  );
  assert.equal(getOrgAgentThinkingLogIcon("contact_talent"), "send");
  assert.equal(getOrgAgentThinkingLogIcon("add_candidate_note"), "write");
  assert.equal(getOrgAgentThinkingLogIcon("start_role_creation"), "run");
});

test("updates one identified tool row from running to done", () => {
  const running = upsertOrgAgentThinkingLog([], {
    at: "2026-08-14T00:00:00.000Z",
    id: "call-1",
    label: "링크 읽는 중",
    status: "running",
  });
  const done = upsertOrgAgentThinkingLog(running, {
    at: "2026-08-14T00:00:01.000Z",
    id: "call-1",
    label: "링크 확인 완료",
    status: "done",
  });

  assert.deepEqual(done, [
    {
      at: "2026-08-14T00:00:00.000Z",
      id: "call-1",
      label: "링크 확인 완료",
      status: "done",
    },
  ]);
});

test("keeps separate tool calls even when their labels match", () => {
  const first = upsertOrgAgentThinkingLog([], {
    at: "2026-08-14T00:00:00.000Z",
    id: "call-1",
    label: "링크 읽는 중",
    status: "running",
  });
  const second = upsertOrgAgentThinkingLog(first, {
    at: "2026-08-14T00:00:01.000Z",
    id: "call-2",
    label: "링크 읽는 중",
    status: "running",
  });

  assert.equal(second.length, 2);
  assert.deepEqual(
    second.map((log) => log.id),
    ["call-1", "call-2"]
  );
});

test("compacts legacy adjacent running and terminal rows by label", () => {
  const compacted = compactOrgAgentThinkingLogs([
    {
      at: "2026-08-14T00:00:00.000Z",
      label: "링크 읽는 중",
      status: "running",
    },
    {
      at: "2026-08-14T00:00:01.000Z",
      label: "링크 읽는 중",
      status: "done",
    },
    {
      at: "2026-08-14T00:00:02.000Z",
      label: "링크 읽는 중",
      status: "running",
    },
    {
      at: "2026-08-14T00:00:03.000Z",
      label: "링크 읽는 중",
      status: "error",
    },
  ]);

  assert.equal(compacted.length, 2);
  assert.deepEqual(
    compacted.map((log) => log.status),
    ["done", "error"]
  );
});

test("a running web step names its search words or page host, as on the candidate side", () => {
  assert.equal(orgAgentToolTarget("web_search", JSON.stringify({ query: "  Canopy   frontend\n hiring " })), "Canopy frontend hiring");
  assert.equal(orgAgentToolTarget("web_search", JSON.stringify({ query: "x".repeat(120) }))?.length, 80);
  assert.equal(orgAgentToolTarget("open_url", JSON.stringify({ url: ["https://www.example.com/a", "https://example.com/b", "not a url"] })), "example.com");
  assert.equal(orgAgentToolTarget("open_url", "{not json"), undefined);
  assert.equal(orgAgentToolTarget("read_role", JSON.stringify({ query: "x" })), undefined);

  const at = "2026-11-06T00:00:00.000Z";
  const logs: OrgAgentThinkingLog[] = [
    { at, icon: "search", id: "a", label: "웹에서 확인하는 중", status: "running", target: "frontend" },
    { at, icon: "link", id: "b", label: "링크를 읽는 중", status: "running", target: "example.com" },
    { at, icon: "search", id: "c", label: "웹 검색 완료", status: "done", target: "frontend" },
  ];
  assert.deepEqual(localizeOrgAgentThinkingLogs(logs, "ko").map((log) => log.label),
    ['"frontend" 검색 중', "example.com 읽는 중", "웹 검색 완료"]);
  assert.deepEqual(localizeOrgAgentThinkingLogs(logs, "en").map((log) => log.label),
    ['Searching "frontend"', "Reading example.com", "Looked around"]);
});

test("the live line says what Harper is doing while no step runs", () => {
  const c = (ko: string) => ko;
  assert.equal(orgAgentLiveStatusLabel(c, true, 0), "생각하는 중");
  assert.equal(orgAgentLiveStatusLabel(c, true, 2), "다음 할 일을 정하는 중");
  assert.equal(orgAgentLiveStatusLabel(c, false, 0), "Thought");
  assert.equal(orgAgentLiveStatusLabel(c, false, 2), undefined);
});
