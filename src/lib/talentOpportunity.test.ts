import assert from "node:assert/strict";
import test from "node:test";
import { OpportunityType } from "./opportunityType";
import {
  buildInternalRecommendationProgress,
  resolveHistorySavedStage,
  fetchTalentOpportunityHistoryPage,
  fetchTalentOpportunitySavedStageHistoryPages,
  formatRecentRecommendedOpportunitiesForPrompt,
  formatRecommendationTimeForPrompt,
  formatTalentRoleActivitiesForPrompt,
  formatUpcomingHarperMeetingForPrompt,
  getOpportunityCompanyName,
  shouldHydrateTalentPostingCard,
  type TalentInternalRecommendationProgressEvent,
  type TalentOpportunityHistoryItem,
  type TalentRecentRecommendationPromptItem,
  type TalentRoleActivityItem,
} from "./talentOpportunity";

test("prefers the workspace company name for internal opportunities", () => {
  assert.equal(
    getOpportunityCompanyName({
      workspace: {
        company_name: "Workspace Company",
      },
    }),
    "Workspace Company"
  );
});

test("does not use a separate alias when the workspace company name is blank", () => {
  assert.equal(
    getOpportunityCompanyName({
      workspace: {
        company_name: "   ",
      },
    }),
    "Unknown company"
  );
});

test("does not hydrate a posting card for an unpresented internal role", () => {
  assert.equal(
    shouldHydrateTalentPostingCard({
      hasFormalRecommendation: false,
      sourceType: "internal",
    }),
    false
  );
  assert.equal(
    shouldHydrateTalentPostingCard({
      hasFormalRecommendation: true,
      sourceType: "internal",
    }),
    true
  );
  assert.equal(
    shouldHydrateTalentPostingCard({
      hasFormalRecommendation: false,
      sourceType: "external",
    }),
    true
  );
});

const baseItem = {
  feedback: "positive",
  feedbackAt: "2026-07-10T05:12:01.000Z",
  isInternal: true,
  recommendedAt: "2026-07-08T01:28:25.000Z",
  status: "active",
} as TalentOpportunityHistoryItem;

test("agent introductions distinguish inbox acceptance from company presentation without time-based closure", () => {
  const received=buildInternalRecommendationProgress({item:baseItem,tags:[],agentIntroductionRootId:'intro-root'});
  assert.equal(received?.code,'agent_request_received');
  const published=buildInternalRecommendationProgress({item:baseItem,tags:[{opportunity_id:'role-1',tag:'내부:연결대기',updated_at:'2026-07-11T05:42:24.000Z'}],agentIntroductionRootId:'intro-root'});
  assert.equal(published?.code,'company_presentation_saved');
});

const processStoppedTags = [
  {
    opportunity_id: "role-1",
    tag: "내부:프로세스중단",
    updated_at: "2026-07-11T05:42:24.000Z",
  },
];

test("Request Intro does not use Harper-first 7/21 progress copy", () => {
  const progress = buildInternalRecommendationProgress({
    item: {
      ...baseItem,
      opportunityType: OpportunityType.IntroRequest,
    },
    tags: [],
  });

  assert.equal(progress, null);
});

test("accepted internal progress promises profile sharing and connection without internal timing", () => {
  const now = new Date().toISOString();
  const progress = buildInternalRecommendationProgress({
    item: { ...baseItem, feedbackAt: now, recommendedAt: now },
    tags: [],
  });

  assert.equal(progress?.code, "waiting_to_share");
  assert.equal(
    progress?.message,
    "Harper가 회원님의 프로필과 관련 경험을 회사에 공유하고 연결을 돕기 위해 진행 중입니다."
  );
  assert.doesNotMatch(progress?.message ?? "", /적절한 타이밍|확인/);
});

function buildStopEvent(
  stopReason?: "candidate" | "company" | "internal"
): TalentInternalRecommendationProgressEvent {
  return {
    createdAt: "2026-07-11T05:42:24.300Z",
    metadata: {
      stage: "process_stopped",
      ...(stopReason ? { stopReason } : {}),
      tag: "내부:프로세스중단",
    },
    text: "연결 수락할 후보에서 프로세스 중단으로 옮겼습니다.",
  };
}

test("uses the candidate-stop message only for an explicit candidate stop", () => {
  const progress = buildInternalRecommendationProgress({
    events: [buildStopEvent("candidate")],
    item: baseItem,
    tags: processStoppedTags,
  });

  assert.equal(progress?.code, "stopped_by_candidate");
  assert.equal(progress?.stopReason, "candidate");
  assert.equal(
    progress?.message,
    "요청하신 대로 이 포지션의 진행을 종료했습니다."
  );
});

test("uses the existing company-closure message for an explicit company stop", () => {
  const progress = buildInternalRecommendationProgress({
    events: [buildStopEvent("company")],
    item: baseItem,
    tags: processStoppedTags,
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stopReason, "company");
  assert.match(progress?.message ?? "", /^회사 측에서/);
});

test("uses the company-closure message for an internal Ops stop", () => {
  const progress = buildInternalRecommendationProgress({
    events: [buildStopEvent("internal")],
    item: baseItem,
    tags: processStoppedTags,
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stopReason, "internal");
  assert.match(progress?.message ?? "", /^회사 측에서/);
});

test("treats legacy un-attributed process stops as internal/company closures", () => {
  const progress = buildInternalRecommendationProgress({
    events: [buildStopEvent()],
    item: baseItem,
    tags: processStoppedTags,
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stopReason, "internal");
  assert.match(progress?.message ?? "", /^회사 측에서/);
  assert.equal(progress?.stageChangedAt, "2026-07-11T05:42:24.000Z");
});

test("treats rejected as a Talent-side rejection record, not company rejection", () => {
  const progress = buildInternalRecommendationProgress({
    item: { ...baseItem, status: "ended" },
    tags: [
      {
        opportunity_id: "role-1",
        tag: "내부:거절",
        updated_at: "2026-07-11T05:42:24.000Z",
      },
    ],
  });

  assert.equal(progress?.code, "rejected_by_talent");
  assert.equal(progress?.stage, "rejected");
  assert.equal(
    progress?.message,
    "현재 기록에는 회원님이 이 연결 제안을 거절한 것으로 표시되어 있습니다. 수락하신 것이 맞다면 기록이 서로 일치하지 않아 확인이 필요합니다."
  );
});

test("keeps archived in the existing company-closure flow after grace", () => {
  const progress = buildInternalRecommendationProgress({
    item: baseItem,
    tags: [
      {
        opportunity_id: "role-1",
        tag: "내부:아카이브",
        updated_at: "2026-07-11T05:42:24.000Z",
      },
    ],
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stage, "archived");
  assert.match(progress?.message ?? "", /^회사 측에서/);
});

test("explains an archived source Position as a Role move", () => {
  const movedAt = "2026-07-11T05:42:24.000Z";
  const progress = buildInternalRecommendationProgress({
    events: [
      {
        createdAt: movedAt,
        metadata: {
          direction: "out",
          eventType: "candidate_role_moved",
          targetRoleName: "AI Engineer",
        },
        text: "Backend Engineer 역할에서 AI Engineer 역할로 이동되었습니다.",
      },
    ],
    item: baseItem,
    tags: [
      {
        opportunity_id: "role-1",
        tag: "내부:아카이브",
        updated_at: movedAt,
      },
    ],
  });

  assert.equal(progress?.code, "moved_to_another_role");
  assert.equal(progress?.stage, "archived");
  assert.match(progress?.message ?? "", /AI Engineer로 변경되었습니다/);
  assert.doesNotMatch(progress?.message ?? "", /더 이상 진행하지 않기로/);
});

test("keeps a recently archived opportunity in the existing grace period", () => {
  const now = new Date().toISOString();
  const progress = buildInternalRecommendationProgress({
    item: {
      ...baseItem,
      feedbackAt: now,
      recommendedAt: now,
    },
    tags: [
      {
        opportunity_id: "role-1",
        tag: "내부:아카이브",
        updated_at: now,
      },
    ],
  });

  assert.equal(progress?.code, "awaiting_company_response");
  assert.equal(progress?.stage, "archived");
  assert.equal(
    progress?.message,
    "회사에게 전달되었고, 회신을 기다리고 있습니다."
  );
});

test("does not build accepted-connection progress for Talent rejection feedback", () => {
  const progress = buildInternalRecommendationProgress({
    item: { ...baseItem, feedback: "negative" },
    tags: [],
  });

  assert.equal(progress, null);
});

test("closes ended and deleted roles with the same post-acceptance guidance", () => {
  for (const status of ["ended", "deleted"]) {
    const progress = buildInternalRecommendationProgress({
      item: { ...baseItem, status },
      tags: [
        {
          opportunity_id: "role-1",
          tag: "내부:연결대기",
          updated_at: "2026-07-11T05:42:24.000Z",
        },
      ],
    });

    assert.equal(progress?.code, "closed_by_company");
    assert.equal(progress?.stage, "pending_connection");
    assert.equal(
      progress?.message,
      "회사에서 해당 역할의 채용을 종료했다고 알려왔습니다. 우선적으로 보고 있는 방향과 더 가까운 후보자와 다음 단계를 진행하게 되었다고 알려왔습니다. 또 다른 좋은 기회가 있을 때 연락드릴게요. 우선 이 기회의 프로세스를 종료하겠습니다. 감사합니다."
    );
  }
});

test("closes an ended role at the accepted stage with limited-review guidance", () => {
  const progress = buildInternalRecommendationProgress({
    item: { ...baseItem, status: "ENDED" },
    tags: [],
  });

  assert.equal(progress?.code, "closed_by_company");
  assert.equal(progress?.stage, null);
  assert.equal(
    progress?.message,
    "회사에 전달했지만, 추가 진행 의사 없이 해당 역할의 채용이 종료되었습니다. 자세한 검토까지 이어지지 않았을 가능성이 높지만 우선 이 기회의 프로세스를 종료하겠습니다."
  );
});

test("final offer is the sole stage exception for every closed role", () => {
  for (const status of ["ended", "deleted"]) {
    const progress = buildInternalRecommendationProgress({
      item: { ...baseItem, status },
      tags: [
        {
          opportunity_id: "role-1",
          tag: "내부:최종오퍼",
          updated_at: "2026-07-11T05:42:24.000Z",
        },
      ],
    });

    assert.equal(progress?.code, "company_next_process");
    assert.equal(progress?.stage, "final_offer");
  }
});

test("keeps an explicit candidate stop authoritative when the role is ended", () => {
  const progress = buildInternalRecommendationProgress({
    events: [buildStopEvent("candidate")],
    item: { ...baseItem, status: "ended" },
    tags: processStoppedTags,
  });

  assert.equal(progress?.code, "stopped_by_candidate");
  assert.equal(progress?.stopReason, "candidate");
  assert.equal(
    progress?.message,
    "요청하신 대로 이 포지션의 진행을 종료했습니다."
  );
});

function buildPromptOpportunity(
  index: number,
  upcomingMeetingAt: string | null = null
): TalentRecentRecommendationPromptItem {
  return {
    companyName: `Company ${index}`,
    companySize: null,
    employmentTypes: [],
    feedback: null,
    feedbackReason: null,
    location: null,
    recommendedAt: new Date(Date.UTC(2026, 8, 1 + index, 1, 35)).toISOString(),
    recommendationId: `recommendation-${index}`,
    roleId: `role-${index}`,
    savedStage: null,
    sourceType: "external",
    title: `Role ${index}`,
    upcomingMeetingAt,
    workMode: null,
  };
}

test("adds upcoming-meeting roles outside the recent opportunity limit", () => {
  const opportunities = Array.from({ length: 11 }, (_, index) =>
    buildPromptOpportunity(
      index,
      index === 10 ? "2026-09-07T05:00:00.000Z" : null
    )
  );

  const text = formatRecentRecommendedOpportunitiesForPrompt(opportunities, 10);

  assert.match(text, /Role 9 at Company 9/);
  assert.match(text, /Role 10 at Company 10/);
  assert.match(text, /Upcoming Harper-connected meeting: Sep 7, 14:00 KST/);
});

test("formats upcoming meetings in compact English KST text", () => {
  assert.equal(formatUpcomingHarperMeetingForPrompt({ startAt: "2026-11-02T15:00:00Z", endAt: null, calendarDate: "2026-11-03", title: "Interview" }), "Upcoming appointment: 2026-11-03; time not specified.");
  assert.equal(
    formatUpcomingHarperMeetingForPrompt(
      "2026-09-07T05:00:00.000Z",
      new Date("2026-08-31T00:00:00.000Z")
    ),
    "Upcoming Harper-connected meeting: Sep 7, 14:00 KST"
  );
});

test("formats recommendation time as readable KST text for LLM context", () => {
  assert.equal(
    formatRecommendationTimeForPrompt("2026-09-04T01:35:10.584998+00:00"),
    "Recommended at: Sep 4, 2026 at 10:35 KST"
  );

  const text = formatRecentRecommendedOpportunitiesForPrompt([
    {
      ...buildPromptOpportunity(0),
      sourceType: "internal",
      recommendedAt: "2026-09-04T01:35:10.584998+00:00",
    },
  ]);
  assert.match(text, /User feedback: none/);
  assert.match(text, /Recommended at: Sep 4, 2026 at 10:35 KST/);
  assert.doesNotMatch(text, /2026-09-04T01:35/);
});

test("formats only the latest 10 role activities as compact text", () => {
  const activities: TalentRoleActivityItem[] = Array.from(
    { length: 11 },
    (_, index) => ({
      content: `memo-${index}\nsecond line`,
      createdAt: new Date(Date.UTC(2026, 7, 31, 12 - index)).toISOString(),
      id: `activity-${index}`,
      kind: "memo",
      previousStage: null,
      savedStage: null,
    })
  );
  activities.push({
    content: null,
    createdAt: "2026-08-31T13:00:00.000Z",
    id: "stage-activity",
    kind: "saved_stage_changed",
    previousStage: "saved",
    savedStage: "connected",
  });

  const text = formatTalentRoleActivitiesForPrompt(activities, 10);
  const lines = text.split("\n");

  assert.equal(lines.length, 10);
  assert.equal(lines[0], "2026-08-31 22:00 KST stage: saved→connected");
  assert.match(text, /memo-0 second line/);
  assert.doesNotMatch(text, /memo-9|memo-10/);
  assert.doesNotMatch(text, /\{|\"kind\"|\"metadata\"/);
});

test("history fills legacy closure while preserving the user's selected progress", () => {
  const legacy = { ...baseItem, savedStage: null };
  assert.equal(resolveHistorySavedStage(legacy, processStoppedTags), "closed");
  for (const savedStage of ["saved", "applied", "connected", "offer", "closed"] as const) {
    assert.equal(resolveHistorySavedStage({ ...legacy, savedStage, status: "ended" }, processStoppedTags), savedStage);
  }
  assert.equal(resolveHistorySavedStage({ ...legacy, savedStage: "hidden" }, processStoppedTags), "hidden");
  assert.equal(resolveHistorySavedStage({ ...legacy, status: "ended" }, []), "closed");
  assert.equal(resolveHistorySavedStage({ ...legacy, status: "ended", savedStage: "connected" }, [{ opportunity_id: "role-1", tag: "내부:최종오퍼", updated_at: null }]), "connected");
  assert.equal(resolveHistorySavedStage(legacy, []), null, "elapsed time alone is not closure");
});


test("page reads hydrate only the selected page and do not count or archive", async () => {
  const calls: string[] = [];
  const selected = Array.from({ length: 11 }, (_, i) => ({ id: `rec-${i}`, role_id: `role-${i}`, list_position: "current", saved_stage: null }));
  const admin = {
    async rpc(name: string, args: { sql_query: string }) {
      calls.push(name);
      assert.equal(name, "set_timeout_and_execute_raw_sql");
      assert.match(args.sql_query, /LIMIT 11/);
      return { data: [[{ items: selected }]], error: null };
    },
    from(table: string) {
      assert.equal(table, "talent_opportunity_recommendation");
      return { select() { return this; }, eq() { return this; },
        async in(_column: string, ids: string[]) {
          assert.equal(ids.length, 10);
          return { data: [], error: null };
        } };
    },
  } as any;
  const page = await fetchTalentOpportunityHistoryPage({ admin, userId: "00000000-0000-4000-8000-000000000001", historyTab: "new", limit: 10, includeCounts: false });
  assert.equal(page.counts, null);
  assert.equal(page.nextOffset, 10);
  assert.equal(calls.length, 1);
});

test("a failed summary stays unknown, rather than returning zero counts", async () => {
  const admin = { rpc: async () => ({ data: null, error: { message: "unavailable" } }) } as any;
  const page = await fetchTalentOpportunityHistoryPage({ admin, userId: "owner", limit: 0 });
  assert.equal(page.counts, null);
});

test("saved stage batches share one index read and hydrate only each requested page", async () => {
  let rpcCalls = 0;
  const row = (id: string) => ({ id, role_id: id, list_position: "current", saved_stage: "saved" });
  const admin = {
    async rpc(name: string) {
      rpcCalls++;
      assert.equal(name, "set_timeout_and_execute_raw_sql");
      return { data: [[{ pages: { saved: [row("a"), row("b"), row("c")], connected: [row("d")] } }]], error: null };
    },
    from(table: string) {
      assert.equal(table, "talent_opportunity_recommendation");
      return { select() { return this; }, eq() { return this; },
        async in(_column: string, ids: string[]) {
          assert.deepEqual(ids, ["a", "b", "d"]);
          return { data: [], error: null };
        } };
    },
  } as any;
  const result = await fetchTalentOpportunitySavedStageHistoryPages({ admin, userId: "00000000-0000-4000-8000-000000000001", savedStages: ["saved", "connected"], limit: 2, includeCounts: false });
  assert.equal(rpcCalls, 1);
  assert.equal(result.counts, null);
  assert.equal(result.pages.saved?.nextOffset, 2);
  assert.equal(result.pages.connected?.nextOffset, null);
});

for (const currentStage of ["offer", null]) {
  test(`a concurrent progress change to ${currentStage} is not overwritten by the earlier page index`, async () => {
    const { fetchTalentOpportunitySearchItems } = await import("./talentOpportunity");
    const id = "00000000-0000-4000-8000-000000000001";
    const current = { id, role_id: id, created_at: "2026-11-01", opportunity_type: "external_jd", feedback: "like", saved_stage: currentStage,
      company_role: { name: "Engineer", source_type: "external", status: "active", company_workspace: { company_name: "Example" } } };
    const admin = {
      rpc: async () => ({ data: [[{ items: [{ id, role_id: id, list_position: "current", saved_stage: "saved" }] }]], error: null }),
      from(table: string) {
        const query: any = { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, range() { return this; },
          then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: table === "talent_opportunity_recommendation" ? [current] : [], error: null })); } };
        return query;
      },
    } as any;
    const items = await fetchTalentOpportunitySearchItems({ admin, userId: id });
    assert.equal(items[0].savedStage, currentStage);
  });
}
