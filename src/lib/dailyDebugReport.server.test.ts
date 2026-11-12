import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://daily-debug.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
const at = "2026-11-10T03:00:00.000Z";

test("REST reads paginate, use KST boundaries, join receipts, and share daily-status exclusions", async () => {
  const { buildDailyDebugReport } = await import("./dailyDebugReport.server");
  const oldFetch = global.fetch;
  const logOffsets: number[] = [];
  let linkedRead = false;
  global.fetch = async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const p = url.searchParams;
    const table = url.pathname.split("/").pop();
    let rows: unknown[] = [];
    if (table === "talent_users")
      rows = [
        { user_id: "real", email: "real@example.org" },
        { user_id: "team", email: "team@matchharper.com" },
        { user_id: "fixture", email: "fixture@example.org" },
        { user_id: "same-email", email: "fixture@example.org" },
        { user_id: "deleted", email: "deleted@example.org", deleted_at: at },
      ];
    if (
      table === "talent_users" &&
      p.get("select")?.includes("talent_experiences")
    ) {
      assert.equal(p.get("user_id"), "in.(real)");
      rows = ["real"].map((user_id) => ({
        user_id,
        talent_experiences: [{ count: 0 }],
        talent_educations: [{ count: 0 }],
        talent_extras: null,
      }));
    }
    if (table === "talent_documents") {
      assert.equal(
        p.get("select"),
        "user_id:talent_id,created_at,storage_path,origin_type"
      );
      assert.equal(p.get("kind"), "eq.resume");
      assert.deepEqual(p.getAll("created_at"), [
        "gte.2026-11-09T15:00:00.000Z",
        "lt.2026-11-10T15:00:00.000Z",
      ]);
      rows = ["real", "fixture", "deleted"].map((user_id) => ({
        user_id,
        created_at: at,
        storage_path: "resume.pdf",
        origin_type: "upload",
      }));
    }
    if (table === "talent_profile_revisions") {
      if (p.has("created_at")) {
        assert.equal(p.get("profile.is_default"), "eq.true");
        assert.deepEqual(p.getAll("created_at"), [
          "gte.2026-11-09T15:00:00.000Z",
          "lt.2026-11-10T15:00:00.000Z",
        ]);
        rows = [
          {
            profile_id: "profile-real",
            revision: 2,
            created_at: at,
            resume_links: ["https://linkedin.com/in/real"],
            source_kind: "profile_ui",
            profile: { talent_id: "real" },
          },
        ];
      } else {
        assert.equal(
          p.get("or"),
          "(and(profile_id.eq.profile-real,revision.eq.1))"
        );
        rows = [
          {
            profile_id: "profile-real",
            revision: 1,
            created_at: "2026-11-08T03:00:00Z",
            resume_links: [],
            source_kind: "existing_profile",
            profile: { talent_id: "real" },
          },
        ];
      }
    }
    if (table === "logs" && p.get("type")?.startsWith("eq."))
      rows = [{ user_id: "fixture" }];
    if (table === "logs" && p.get("type")?.startsWith("like."))
      rows = [
        {
          id: 1,
          user_id: "real",
          type: "career_profile_source_save_failed:profile_ingest",
          error: "write failed",
        },
        {
          id: 2,
          user_id: "fixture",
          type: "career_profile_source_save_failed:profile_ingest",
          error: "test failed",
        },
      ];
    if (table === "external_recommendation_runs") {
      assert.equal(p.get("variant"), "eq.career_agent");
      assert.deepEqual(p.getAll("finished_at"), [
        "gte.2026-11-09T15:00:00.000Z",
        "lt.2026-11-10T15:00:00.000Z",
      ]);
      rows = [
        {
          id: "search",
          talent_id: "real",
          status: "partial",
          created_at: at,
          finished_at: at,
          error: "timeout",
        },
      ];
    }
    if (table === "talent_external_operations") {
      assert.equal(p.get("kind"), "eq.browser_run");
      rows = ["production", "development"].map((environment) => ({
        id: environment,
        talent_id: "real",
        environment,
        status: "failed",
        created_at: at,
        finished_at: at,
        error: "browser error",
      }));
    }
    if (table === "logs" && p.has("or")) {
      assert.deepEqual(p.getAll("created_at"), [
        "gte.2026-11-09T15:00:00.000Z",
        "lt.2026-11-10T15:00:00.000Z",
      ]);
      logOffsets.push(Number(p.get("offset") ?? 0));
      rows = Array.from({ length: 1001 }, () => ({
        user_id: "real",
        type: "career_tool_call:read_talent_context",
        created_at: at,
      }));
      rows.push({
        user_id: "team",
        type: "career_tool_call:web_search",
        created_at: at,
      });
      rows.push({
        user_id: "fixture",
        type: "career_tool_call:web_search",
        created_at: at,
      });
      rows.push({
        user_id: "same-email",
        type: "career_tool_call:web_search",
        created_at: at,
      });
    }
    if (table === "opportunity_discovery_run")
      rows = ["real", "team", "fixture"].map((talent_id) => ({
        id: `run-${talent_id}`,
        talent_id,
        trigger: "career_schedule_due",
        status: "completed",
        created_at: at,
        updated_at: at,
        started_at: at,
        completed_at: at,
        not_before: at,
        error_message: null,
        agentOutcome: "sent",
        runContract: "career_agent_v1",
      }));
    if (table === "opportunity_discovery_run")
      rows.push({
        id: "deleted-backlog",
        talent_id: "deleted",
        status: "queued",
        trigger_payload: {},
      });
    if (table === "talent_opportunity_delivery" && p.has("discovery_run_id")) {
      assert.equal(p.get("discovery_run_id"), "in.(run-real)");
      linkedRead = true;
      rows = [
        {
          id: "after-midnight",
          talent_id: "real",
          discovery_run_id: "run-real",
          channel: "email",
          status: "sent",
          sent_at: "2026-11-10T15:30:00.000Z",
        },
      ];
    }
    if (table === "talent_opportunity_recommendation")
      rows = [
        {
          id: "old-rec",
          talent_id: "real",
          opportunity_type: "external",
          created_at: "2026-11-01T00:00:00Z",
          feedback: "like",
          feedback_at: at,
        },
        {
          id: "new-rec",
          talent_id: "real",
          opportunity_type: "external",
          created_at: at,
          feedback: null,
        },
        {
          id: "test-rec",
          talent_id: "fixture",
          opportunity_type: "external",
          created_at: at,
          feedback: "like",
          feedback_at: at,
        },
      ];
    if (table === "talent_progress") {
      assert.deepEqual(p.getAll("created_at"), [
        "gte.2026-11-09T15:00:00.000Z",
        "lt.2026-11-10T15:00:00.000Z",
      ]);
      rows = [
        {
          id: "feedback",
          talent_id: "real",
          role_id: "role",
          recommendation_id: "old-rec",
          kind: "candidate_opportunity_feedback_changed",
          created_at: at,
          feedback: "like",
          savedStage: null,
        },
      ];
    }
    if (table === "agent_contact_messages")
      rows = [
        {
          id: "intro",
          root_id: "intro",
          talent_id: "real",
          role_id: "internal",
          direction: "to_company",
          material_id: "material",
          created_at: at,
          legacyCorrespondence: null,
        },
        {
          id: "fixture",
          root_id: "fixture",
          talent_id: "fixture",
          role_id: "internal",
          direction: "to_company",
          material_id: "material",
          created_at: at,
          legacyCorrespondence: null,
        },
      ];
    if (table === "email_reply_jobs")
      rows = [
        {
          id: "ops",
          talent_id: "real",
          kind: "ops_email_test",
          status: "failed",
          created_at: at,
        },
      ];
    if (table === "talent_agent_schedules")
      rows = [
        {
          id: "stopped",
          talent_id: "real",
          next_run_at: at,
          schedule_key: "career_check_in",
        },
        {
          id: "explicit",
          talent_id: "real",
          next_run_at: at,
          schedule_key: "custom",
        },
      ];
    if (table === "talent_setting")
      rows = [
        {
          user_id: "real",
          status: "stopped",
          get_external_recommendation: false,
        },
      ];
    const from = Number(p.get("offset") ?? 0);
    const limit = Number(p.get("limit") ?? 1000);
    return new Response(JSON.stringify(rows.slice(from, from + limit)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const report = await buildDailyDebugReport(
      "2026-11-10",
      new Date("2026-11-10T16:00:00Z")
    );
    for (const section of [
      report.runs,
      report.deliveries,
      report.tools,
      report.recommendations,
      report.replies,
      report.schedules,
      report.sources,
      report.profiles,
      report.profileErrors,
      report.searches,
      report.browsers,
    ])
      assert.equal(section.error, undefined);
    assert.deepEqual(logOffsets, [0, 1000]);
    assert.equal(linkedRead, true);
    assert.equal(report.profiles.data!.registeredUsers, 1);
    assert.deepEqual(report.profiles.data!.emptyUserIds, ["real"]);
    assert.equal(report.profileErrors.data!.length, 1);
    assert.equal(report.searches.data![0].status, "partial");
    assert.equal(report.browsers.data!.length, 1);
    assert.equal(report.runs.data!.length, 1);
    assert.equal(report.deliveries.data![0].id, "after-midnight");
    assert.deepEqual(report.tools.data, [
      {
        name: "read_talent_context",
        callCount: 1001,
        userCount: 1,
        failedCallCount: 0,
      },
    ]);
    assert.equal(report.recommendations.data!.external.recommended.count, 1);
    assert.equal(
      report.recommendations.data!.external.likes.count,
      1,
      "reaction to an older recommendation belongs to the reaction day"
    );
    assert.deepEqual(report.recommendations.data!.internal.submitted, {
      count: 1,
      users: 1,
    });
    assert.deepEqual(report.replies.data, []);
    assert.deepEqual(
      report.schedules.data!.map((r) => r.id),
      ["explicit"]
    );
  } finally {
    global.fetch = oldFetch;
  }
});

test("one failed query remains unavailable without suppressing the other sections", async () => {
  const { buildDailyDebugReport } = await import("./dailyDebugReport.server");
  const oldFetch = global.fetch;
  global.fetch = async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.pathname.endsWith("/career_daily_sources"))
      return new Response(
        JSON.stringify({ code: "42P01", message: "relation unavailable" }),
        { status: 400 }
      );
    return new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const report = await buildDailyDebugReport("2026-11-10");
    assert.equal(report.sources.data, null);
    assert.match(report.sources.error!, /relation unavailable/);
    assert.deepEqual(report.runs.data, []);
    assert.deepEqual(report.tools.data, []);
  } finally {
    global.fetch = oldFetch;
  }
});
