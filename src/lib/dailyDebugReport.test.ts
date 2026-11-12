import { emptyDebugRecommendationGroup } from "./dailyDebugRecommendations";
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDebugRun,
  debugRunStartedAt,
  formatDailyDebugSlackMessages,
  inDebugDay,
  splitDebugSlackText,
  type DailyDebugReport,
  type DebugDelivery,
  type DebugRun,
} from "./dailyDebugReport";

const at = "2026-11-10T03:00:00.000Z";
const run: DebugRun = {
  id: "run",
  talent_id: "user",
  trigger: "career_schedule_due",
  status: "completed",
  created_at: at,
  updated_at: at,
  started_at: at,
  completed_at: at,
  not_before: at,
  error_message: null,
  coverage: { agentOutcome: "no_send" },
  trigger_payload: { runContract: "career_agent_v1" },
};
const delivery: DebugDelivery = {
  id: "delivery",
  talent_id: "user",
  discovery_run_id: "run",
  channel: "email",
  status: "sent",
  created_at: at,
  updated_at: at,
  sent_at: at,
  error_message: null,
  payload: {},
};
function report(): DailyDebugReport {
  return {
    date: "2026-11-10",
    startIso: "2026-11-09T15:00:00.000Z",
    endIso: "2026-11-10T15:00:00.000Z",
    observedAt: "2026-11-10T16:00:00.000Z",
    runs: { data: [run] },
    deliveries: { data: [] },
    tools: { data: [] },
    recommendations: {
      data: {
        external: emptyDebugRecommendationGroup(),
        internal: emptyDebugRecommendationGroup(),
        externalSubmissionCoverage: "recorded_application_flow_only",
      },
    },
    replies: { data: [] },
    schedules: { data: [] },
    sources: { data: [] },
    profiles: {
      data: {
        registeredUsers: 20,
        emptyUserIds: ["empty"],
        resumeUsers: 15,
        linkedinUsers: 10,
      },
    },
    profileErrors: { data: [] },
    searches: { data: [] },
    browsers: { data: [] },
  };
}

test("normal no-send requires an explicit outcome; pending, unknown, cancellation and failed receipts stay distinct", () => {
  assert.equal(classifyDebugRun(run, []), "noSend");
  assert.equal(classifyDebugRun({ ...run, coverage: {} }, []), "unknown");
  assert.equal(
    classifyDebugRun({ ...run, coverage: { agentOutcome: "sent" } }, []),
    "unknown"
  );
  assert.equal(
    classifyDebugRun(run, [{ ...delivery, status: "retry", sent_at: null }]),
    "pending"
  );
  assert.equal(
    classifyDebugRun(run, [
      { ...delivery, status: "delivery_unknown", sent_at: null },
    ]),
    "unknown"
  );
  assert.equal(
    classifyDebugRun(run, [
      { ...delivery, status: "context_changed", sent_at: null },
    ]),
    "cancelled"
  );
  assert.equal(
    classifyDebugRun(run, [{ ...delivery, status: "failed", sent_at: null }]),
    "failedNoSend"
  );
  assert.equal(
    classifyDebugRun({ ...run, status: "failed" }, []),
    "failedNoSend"
  );
});

test("provider receipt survives failed follow-up and stale delivery status", () => {
  assert.equal(
    classifyDebugRun({ ...run, status: "failed" }, [delivery]),
    "sentWithError"
  );
  // The provider accepted this email before the persistence callback failed.
  assert.equal(
    classifyDebugRun(run, [
      {
        ...delivery,
        status: "retry",
        payload: { resendEmailId: "provider-id" },
      },
    ]),
    "sent"
  );
  assert.equal(
    classifyDebugRun({ ...run, status: "handed_off" }, [delivery]),
    "pending"
  );
});

test("day starts exclude older runs and keep delivery received after midnight", () => {
  const r = report();
  const onboarding = {
    ...run,
    id: "onboarding",
    started_at: null,
    trigger: "conversation_completed",
    trigger_payload: { agentInvocation: { acceptedAt: at } },
  };
  assert.equal(debugRunStartedAt(onboarding), at);
  r.runs.data!.push(
    {
      ...run,
      id: "old",
      started_at: "2026-11-08T03:00:00.000Z",
      status: "handed_off",
    },
    onboarding
  );
  r.deliveries.data!.push({ ...delivery, sent_at: "2026-11-10T15:30:00.000Z" });
  const text = formatDailyDebugSlackMessages(r).main;
  assert.match(text, /정기 커리어 실행\* — 시작 1건\n• 메일·메시지 보냄 1건/);
  assert.deepEqual(formatDailyDebugSlackMessages(r).details, []);
  assert.equal(inDebugDay(r.startIso, r), true);
  assert.equal(inDebugDay(r.endIso, r), false);
});

test("query failure is visible and never converted to a healthy zero", () => {
  const r = report();
  r.deliveries = { data: null, error: "read failed" };
  r.tools = { data: null, error: "logs unavailable" };
  const text = formatDailyDebugSlackMessages(r).main;
  assert.match(text, /집계하지 못한 항목 2개/);
  assert.match(text, /발송 결과 집계 실패/);
  assert.doesNotMatch(text, /무발송 완료 1/);
  assert.doesNotMatch(text, /기록된 실행·메일·Tool 오류 0건/);
});

test("completed internal evaluations do not require delivery receipts", () => {
  const r = report();
  r.runs.data!.push({
    ...run,
    id: "internal",
    trigger: "career_internal_evaluation",
    coverage: {},
    trigger_payload: { runContract: "career_internal_evaluation_v1" },
  });
  const messages = formatDailyDebugSlackMessages(r);
  assert.doesNotMatch(messages.main, /실행 결과 확인 필요/);
  assert.deepEqual(messages.details, []);
});

test("top 20 keeps errors outside the ranking without repeating tools", () => {
  const r = report();
  r.tools.data = Array.from({ length: 21 }, (_, i) => ({
    name: `tool_${i}`,
    callCount: 30 - i,
    userCount: 1,
    failedCallCount: i === 0 || i === 20 ? 1 : 0,
  }));
  const output = formatDailyDebugSlackMessages(r);
  assert.equal(output.details.length, 1);
  const [top, failed] = output.details[0].split("*상위 20개 밖에서 오류가 난 Tool");
  assert.match(top, /tool_19 ·/);
  assert.doesNotMatch(top, /tool_20 ·/);
  assert.match(failed, /tool_20 ·.*오류 1회/);
  assert.doesNotMatch(failed, /tool_0 ·/);
});

test("feature failures and overdue work are distinct from recent work and completed replies", () => {
  const r = report();
  const minutesAgo = (minutes: number) =>
    new Date(Date.parse(r.observedAt) - minutes * 60_000).toISOString();
  r.browsers.data = [
    { id: "late", status: "running", created_at: minutesAgo(61) },
    { id: "recent", status: "running", created_at: minutesAgo(59) },
    { id: "failed", status: "failed", created_at: at },
    { id: "success", status: "succeeded", created_at: at },
  ].map((row) => ({ ...row, talent_id: "user", finished_at: at, error: null }));
  r.replies.data = [
    { id: "late", status: "waiting_career", created_at: minutesAgo(31) },
    { id: "recent", status: "queued", created_at: minutesAgo(29) },
    { id: "sent", status: "sent", created_at: at },
    { id: "skipped", status: "skipped", created_at: at },
    { id: "failed", status: "failed", created_at: at },
  ].map((row) => ({
    ...row,
    talent_id: "user",
    kind: "reply",
    updated_at: at,
    processed_at: null,
    last_error: null,
  }));
  const output = formatDailyDebugSlackMessages(r);
  assert.match(output.main, /모두 0개: \*1명 \(5.0%\)/);
  assert.match(
    output.main,
    /자동 브라우저 실행 실패: 종료 2건 중 1건 \(50.0%\)/
  );
  assert.match(output.main, /1시간 넘게 종료되지 않은 자동 브라우저: 1건/);
  assert.match(output.main, /답장을 보내다 실패: 1건/);
  assert.match(output.main, /30분 넘게 답장을 못 보냄: 1건/);
  assert.match(output.details.join("\n"), /자동 브라우저 1시간 이상 미종료 1건 · 최장 1시간 1분/);
  assert.match(output.details.join("\n"), /사용자 이메일 답장 30분 이상 지연 1건 · 최장 31분/);
  r.profiles.data = {
    registeredUsers: 0,
    emptyUserIds: [],
    resumeUsers: 0,
    linkedinUsers: 0,
  };
  assert.match(
    formatDailyDebugSlackMessages(r).main,
    /모두 0개: \*0명 \(해당 없음\)/
  );
});

test("Slack groups repeated errors, leaves out record IDs, and only shows recorded submission activity", () => {
  const r = report();
  r.profileErrors.data = ["log-1", "log-2"].map((id) => ({
    id,
    user_id: "candidate-id",
    type: "career_profile_source_save_failed:talent_document_text_extraction",
    error: "DOMMatrix is not defined\n    at parseResume",
  }));
  r.searches.data = [{
    id: "search-id",
    talent_id: "candidate-id",
    status: "failed",
    created_at: at,
    finished_at: at,
    error: JSON.stringify([{ message: "Expected ISO alpha-2 country code", path: [8, "countryCode"] }], null, 2),
  }];
  const preview = formatDailyDebugSlackMessages(r);
  assert.doesNotMatch(preview.main, /제출|전체 집계 불가/);
  assert.equal(preview.details.length, 1);
  assert.match(preview.details[0], /이력서·프로필 오류 2건 · DOMMatrix is not defined/);
  assert.match(preview.details[0], /외부 공고 검색 오류 1건 · Expected ISO alpha-2 country code/);
  assert.doesNotMatch(preview.details[0], /log-1|candidate-id|search-id|parseResume|countryCode|제출/);

  r.recommendations.data!.external.submitted = { count: 2, users: 1 };
  assert.match(formatDailyDebugSlackMessages(r).main, /기록으로 확인된 제출 완료 2건 \/ 1명/);
});

test("Slack details split without truncating long errors or enabling mentions", () => {
  const text = "x".repeat(80001);
  const chunks = splitDebugSlackText(text);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((c) => c.length <= 35000));
  const r = report();
  r.runs.data = [
    {
      ...run,
      status: "failed",
      error_message: "<!channel> <https://example.com|link>",
    },
  ];
  const output = formatDailyDebugSlackMessages(r).details.join("\n");
  assert.ok(output.includes("&lt;!channel&gt;"));
  assert.ok(!output.includes("<!channel>"));
});
