import { emptyDebugRecommendationGroup } from "../src/lib/dailyDebugRecommendations";
import {
  formatDailyDebugSlackMessages,
  type DailyDebugReport,
  type DebugRun,
  type DebugDelivery,
} from "../src/lib/dailyDebugReport";

// No send path. Default is a synthetic example; --date reads the database only.
async function main() {
  const dateIndex = process.argv.indexOf("--date");
  if (dateIndex >= 0) {
    const date = process.argv[dateIndex + 1];
    if (!date) throw new Error("--date requires YYYY-MM-DD");
    const { buildDailyDebugReport } =
      await import("../src/lib/dailyDebugReport.server");
    const report = await buildDailyDebugReport(date);
    const output = formatDailyDebugSlackMessages(report);
    console.log(output.main + "\n\n" + output.details.join("\n\n"));
    return;
  }
  const at = "2026-11-10T03:00:00.000Z";
  const runs: DebugRun[] = [];
  const deliveries: DebugDelivery[] = [];
  function add(
    trigger: string,
    count: number,
    outcome: "sent" | "no_send" | "failed" | "running"
  ) {
    for (let i = 0; i < count; i++) {
      const id = `example-run-${runs.length + 1}`;
      runs.push({
        id,
        talent_id: "example-user",
        trigger,
        status:
          outcome === "failed"
            ? "failed"
            : outcome === "running"
              ? "handed_off"
              : "completed",
        created_at: at,
        updated_at: at,
        started_at: at,
        completed_at: outcome === "running" ? null : at,
        not_before: at,
        coverage: { agentOutcome: outcome },
        trigger_payload: { runContract: "career_agent_v1" },
        error_message:
          outcome === "failed" ? "Provider request timed out" : null,
      });
      if (outcome === "sent")
        deliveries.push({
          id: `example-delivery-${deliveries.length + 1}`,
          talent_id: "example-user",
          discovery_run_id: id,
          channel: "email",
          status: "sent",
          created_at: at,
          updated_at: at,
          sent_at: at,
          error_message: null,
          payload: {},
        });
    }
  }
  add("career_schedule_due", 28, "sent");
  add("career_schedule_due", 10, "no_send");
  add("career_schedule_due", 2, "failed");
  add("career_schedule_due", 1, "running");
  add("career_daily_due", 6, "sent");
  add("career_daily_due", 2, "no_send");
  const report: DailyDebugReport = {
    date: "2026-11-10",
    startIso: "2026-11-09T15:00:00.000Z",
    endIso: "2026-11-10T15:00:00.000Z",
    observedAt: "2026-11-10T16:00:00.000Z",
    runs: { data: runs },
    deliveries: { data: deliveries },
    tools: {
      data: [
        {
          name: "web_search",
          callCount: 120,
          userCount: 24,
          failedCallCount: 2,
        },
        {
          name: "read_recommended_opportunities",
          callCount: 85,
          userCount: 20,
          failedCallCount: 0,
        },
        {
          name: "read_talent_context",
          callCount: 64,
          userCount: 18,
          failedCallCount: 0,
        },
      ],
    },
    recommendations: {
      data: {
        external: {
          ...emptyDebugRecommendationGroup(),
          recommended: { count: 72, users: 25 },
          likes: { count: 10, users: 8 },
          dislikes: { count: 4, users: 3 },
          kept: { count: 6, users: 4 },
          saved: { count: 12, users: 8 },
          views: { count: 42, users: 20 },
          clicks: { count: 19, users: 12 },
          applyClicks: { count: 14, users: 9 },
          applyRequests: { count: 6, users: 4 },
          directApplyClicks: { count: 8, users: 5 },
          confirmed: { count: 3, users: 2 },
          submitted: { count: 2, users: 2 },
        },
        internal: {
          ...emptyDebugRecommendationGroup(),
          recommended: { count: 8, users: 6 },
          candidateRequested: { count: 3, users: 2 },
          likes: { count: 2, users: 2 },
          dislikes: { count: 1, users: 1 },
          kept: { count: 1, users: 1 },
          saved: { count: 2, users: 2 },
          views: { count: 6, users: 4 },
          clicks: { count: 2, users: 2 },
          applyClicks: { count: 3, users: 2 },
          confirmed: { count: 2, users: 2 },
          submitted: { count: 2, users: 2 },
        },
        externalSubmissionCoverage: "recorded_application_flow_only",
      },
    },
    replies: {
      data: Array.from({ length: 7 }, (_, i) => ({
        id: `example-reply-${i}`,
        talent_id: "example-user",
        kind: "reply",
        status: i === 6 ? "skipped" : "sent",
        created_at: at,
        updated_at: at,
        processed_at: at,
        last_error: null,
      })),
    },
    schedules: { data: [] },
    sources: { data: [] },
    profiles: {
      data: {
        registeredUsers: 120,
        emptyUserIds: ["example-empty-1", "example-empty-2", "example-empty-3"],
        resumeUsers: 100,
        linkedinUsers: 50,
      },
    },
    profileErrors: {
      data: [
        {
          id: "example-log",
          user_id: "example-empty-1",
          type: "career_profile_source_save_failed:profile_ingest",
          error: "Profile write failed",
        },
      ],
    },
    searches: {
      data: Array.from({ length: 50 }, (_, i) => ({
        id: `example-search-${i}`,
        talent_id: "example-user",
        status: i === 0 ? "failed" : "completed",
        created_at: at,
        finished_at: at,
        error: i === 0 ? "Search timed out" : null,
      })),
    },
    browsers: { data: [] },
  };
  const output = formatDailyDebugSlackMessages(report);
  console.log(
    "[예시 데이터 · 실제 운영 수치 아님]\n\n" +
      output.main +
      "\n\n" +
      output.details.join("\n\n")
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
