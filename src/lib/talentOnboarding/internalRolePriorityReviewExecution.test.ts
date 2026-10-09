import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

const nodeModule = Module as typeof Module & {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalModuleLoad = nodeModule._load;
nodeModule._load = function loadWithServerOnlyStub(
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return originalModuleLoad.call(this, request, parent, isMain);
};
const talentToolsPromise = import("./tools").finally(() => {
  nodeModule._load = originalModuleLoad;
});

const ROLE_ID = "11111111-1111-4111-8111-111111111111";
const TALENT_ID = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

class FakePriorityReviewQuery {
  private filters = new Map<string, unknown>();
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
  private operation: "delete" | "insert" | "select" = "select";
  private payload: Row | null = null;

  constructor(
    private readonly admin: FakePriorityReviewAdmin,
    private readonly table: string
  ) {}

  select() {
    return this;
  }

  insert(payload: Row) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  is(column: string, value: unknown) {
    return this.eq(column, value);
  }

  order(column: string, options: { ascending: boolean }) {
    this.orders.push({ column, ascending: options.ascending });
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  maybeSingle() {
    const result = this.execute();
    const rows = Array.isArray(result.data) ? result.data : [];
    return Promise.resolve({ data: rows[0] ?? null, error: result.error });
  }

  single() {
    const result = this.execute();
    const rows = Array.isArray(result.data) ? result.data : [];
    return Promise.resolve({ data: rows[0] ?? null, error: result.error });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return Array.from(this.filters).every(
      ([column, value]) => column === "metadata->>withdrawnAt"
        ? ((row.metadata as Row | undefined)?.withdrawnAt ?? null) === value
        : row[column] === value
    );
  }

  private execute(): { data: Row[] | null; error: null } {
    this.admin.calls.push({ operation: this.operation, table: this.table });

    if (this.table === "logs") {
      return { data: null, error: null };
    }

    const rows = this.admin.rowsFor(this.table);
    if (this.operation === "delete") {
      const retained = rows.filter((row) => !this.matches(row));
      this.admin.replaceRows(this.table, retained);
      return { data: null, error: null };
    }

    if (this.operation === "insert") {
      const inserted = {
        ...this.payload,
        created_at: this.admin.insertedAt,
        id: `inserted-${rows.length + 1}`,
      };
      rows.push(inserted);
      return { data: [inserted], error: null };
    }

    const selected = rows.filter((row) => this.matches(row));
    selected.sort((left, right) => {
      for (const { column, ascending } of this.orders) {
        const comparison = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
        if (comparison) return ascending ? comparison : -comparison;
      }
      return 0;
    });
    return { data: this.rowLimit === null ? selected : selected.slice(0, this.rowLimit), error: null };
  }
}

class FakePriorityReviewAdmin {
  settings: Row[] = [{ user_id: TALENT_ID, is_onboarding_done: true }];
  activityEvents: Row[] = [];
  calls: Array<{ operation: string; table: string }> = [];
  fits: Row[] = [];
  matchingReviews: Row[] = [];
  insertedAt = new Date().toISOString();
  companyProposals: Row[] = [];
  officialJobs: Row[] = [];
  progress: Row[] = [];
  recommendations: Row[] = [];
  tags: Row[] = [];
  roles: Row[] = [
    {
      company_workspace: {
        company_name: "Acme",
        published_name: "Public Acme",
      },
      expires_at: null,
      information: {},
      is_expired: false,
      name: "Platform Engineer",
      role_id: ROLE_ID,
      source_type: "internal",
      status: "active",
      summary: {
        en: { content: "English role summary" },
        ko: { content: "한국어 역할 요약" },
      },
    },
  ];

  from(table: string) {
    return new FakePriorityReviewQuery(this, table);
  }

  rowsFor(table: string) {
    if (table === "talent_setting") return this.settings;
    if (table === "company_roles") return this.roles;
    if (table === "official_jobs") return this.officialJobs;
    if (table === "talent_activity_events") return this.activityEvents;
    if (table === "talent_role_fit_with_selection_v1") return this.fits;
    if (table === "talent_opportunity_matching_review") return this.matchingReviews;
    if (table === "company_intro_candidates") return this.companyProposals;
    if (table === "talent_opportunity_recommendation") {
      return this.recommendations;
    }
    if (table === "talent_opportunity_tag") return this.tags;
    if (table === "talent_progress") return this.progress;
    return [];
  }

  async rpc(name: string, args: Record<string, unknown>) {
    if (name === "present_talent_internal_role_recommendation_for_review_v1") {
      this.calls.push({operation:"rpc",table:name});
      return {data:{status:"recommended",targetRoleName:"Platform Engineer",companyShared:false},error:null};
    }
    assert.equal(name, "withdraw_candidate_priority_review_v1");
    let withdrawn = false;
    for (const row of this.progress) {
      const metadata = (row.metadata ?? {}) as Row;
      if (row.talent_id === args.p_talent_id && row.role_id === args.p_role_id && !metadata.withdrawnAt) {
        row.metadata = { ...metadata, withdrawnAt: this.insertedAt };
        withdrawn = true;
      }
    }
    return { data: { withdrawn, withdrawnAt: this.insertedAt }, error: null };
  }

  replaceRows(table: string, rows: Row[]) {
    if (table === "talent_progress") this.progress = rows;
  }
}

test("incomplete onboarding does not register or share a priority review", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.settings = [{ user_id: TALENT_ID, is_onboarding_done: false }];
  const result = await runPriorityReview(admin);
  assert.equal(result.status, "onboarding_required");
  assert.equal(result.requestCreated, false);
  assert.equal(result.companyShared, false);
  assert.equal(admin.progress.length, 0);
  assert.equal(admin.calls.some((call) => call.operation === "insert" && call.table !== "logs"), false);
});

test("missing onboarding setting does not register a priority review", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.settings = [];
  const result = await runPriorityReview(admin);
  assert.equal(result.status, "onboarding_required");
  assert.equal(admin.progress.length, 0);
});

async function runPriorityReview(
  admin: FakePriorityReviewAdmin,
  responseLocale: string | null = "ko",
  conversationId?: string,
  action: "register" | "status" = "register"
) {
  const { executeTalentTool, TALENT_TOOL_NAMES } = await talentToolsPromise;
  return (await executeTalentTool({
    context: {
      admin: admin as never,
      conversationId,
      responseLocale,
      userId: TALENT_ID,
    },
    input: { action, roleId: ROLE_ID },
    logging: false,
    name: TALENT_TOOL_NAMES.INTERNAL_ROLE_PRIORITY_REVIEW,
  })) as Row;
}

test("register creates one fit request and repeated register preserves its time", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.fits = [
    {
      human_label: null,
      id: "fit-1",
      label: "fit",
      opportunity_id: ROLE_ID,
      reevaluation_criteria: null,
      talent_id: TALENT_ID,
    },
  ];

  const created = await runPriorityReview(admin);
  const firstCallDataOperations = admin.calls.filter(
    (call) => call.table !== "logs"
  );
  const repeated = await runPriorityReview(admin);
  const allDataOperations = admin.calls.filter((call) => call.table !== "logs");

  assert.equal(created.status, "created");
  assert.equal(repeated.status, "already_exists");
  assert.equal(created.companyName, "Public Acme");
  assert.equal(created.roleTitle, "Platform Engineer");
  assert.equal("roleSummary" in created, false);
  assert.equal(created.requestedAt, admin.insertedAt);
  assert.equal(repeated.requestedAt, admin.insertedAt);
  assert.equal(admin.progress.length, 1);
  assert.equal(allDataOperations.filter(call => call.operation === "insert" && call.table === "talent_progress").length, 1);
  assert.equal("effectiveFitLabel" in created, false);
  assert.equal("reevaluationCriteria" in created, false);
  assert.equal(created.recommendationAvailable, true);
  assert.equal(created.companyShared, false);
  assert.doesNotMatch(
    String(created.assistantInstruction),
    /longer and more detailed/
  );
});

test("a published official job keeps its candidate-facing company and role labels", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.activityEvents = [
    {
      conversation_id: "conversation-1",
      created_at: "2026-09-06T00:00:00.000Z",
      event_type: "official_jobs_signup_intent",
      source: "official_jobs_onboarding:public-agent-deployment",
      talent_id: TALENT_ID,
    },
  ];
  admin.officialJobs = [
    {
      company_name: "Another Public Name",
      is_published: true,
      role_id: ROLE_ID,
      role_title: "Another Public Role",
      slug: "another-public-role",
      updated_at: "2026-09-07T00:00:00.000Z",
    },
    {
      company_name: "Public Agentic AI Company",
      is_published: true,
      role_id: ROLE_ID,
      role_title: "Software Engineer, AI Agent Deployment",
      slug: "public-agent-deployment",
      updated_at: "2026-09-06T00:00:00.000Z",
    },
  ];

  const result = await runPriorityReview(admin, "ko", "conversation-1");

  assert.equal(result.companyName, "Public Agentic AI Company");
  assert.equal(result.roleTitle, "Software Engineer, AI Agent Deployment");
});

test("an existing recommendation returns a position card without a request", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.recommendations = [
    {
      created_at: "2026-09-01T00:00:00.000Z",
      id: "recommendation-1",
      role_id: ROLE_ID,
      talent_id: TALENT_ID,
    },
  ];

  const result = await runPriorityReview(admin);

  assert.equal(result.status, "already_formally_recommended");
  assert.deepEqual(result.postingRoleIds, [ROLE_ID]);
  assert.equal(admin.progress.length, 0);
  assert.match(String(result.assistantInstruction), /position card/);
  assert.doesNotMatch(
    String(result.assistantInstruction),
    /not a general job-board feed/
  );
});

for (const scenario of [
  {
    name: "a declined recommendation",
    recommendation: { feedback: "dislike", saved_stage: null },
    status: "previously_declined",
    text: /user declined it/,
  },
  {
    name: "an accepted recommendation",
    recommendation: { feedback: "like", saved_stage: "connected" },
    status: "already_accepted",
    text: /already accepted/,
  },
  {
    name: "a closed recommendation",
    recommendation: { feedback: "dislike", saved_stage: "closed" },
    status: "previous_process_closed",
    text: /process is now closed/,
  },
]) {
  test(`${scenario.name} is not reported as a current unanswered recommendation`, async () => {
    const admin = new FakePriorityReviewAdmin();
    admin.recommendations = [
      {
        created_at: "2026-09-01T00:00:00.000Z",
        id: "recommendation-1",
        role_id: ROLE_ID,
        talent_id: TALENT_ID,
        ...scenario.recommendation,
      },
    ];

    const result = await runPriorityReview(admin);

    assert.equal(result.status, scenario.status);
    assert.equal("postingRoleIds" in result, false);
    assert.match(String(result.assistantInstruction), scenario.text);
    assert.equal(admin.progress.length, 0);
  });
}

test("a terminal process tag takes precedence over stale recommendation fields", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.recommendations = [
    {
      created_at: "2026-09-01T00:00:00.000Z",
      feedback: "like",
      id: "recommendation-1",
      role_id: ROLE_ID,
      saved_stage: "connected",
      talent_id: TALENT_ID,
    },
  ];
  admin.tags = [
    {
      opportunity_id: ROLE_ID,
      tag: "내부:프로세스중단",
      talent_id: TALENT_ID,
    },
  ];

  const result = await runPriorityReview(admin);

  assert.equal(result.status, "previous_process_closed");
  assert.equal(result.recommendationState, "closed");
});

test("paused hiring keeps priority review registration and existing-request reads available", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.roles[0].status = "paused";
  const created = await runPriorityReview(admin);

  assert.equal(created.status, "created");
  assert.equal(admin.progress.length, 1);

  admin.progress = [
    {
      created_at: admin.insertedAt,
      id: "request-1",
      kind: "candidate_requested_connection",
      role_id: ROLE_ID,
      talent_id: TALENT_ID,
    },
  ];

  const result = await runPriorityReview(admin);

  assert.equal(result.status, "already_exists");
  assert.equal(result.requestedAt, admin.insertedAt);
  assert.equal(result.requestCreated, false);
  assert.equal(result.reviewState, "review_requested");
  assert.equal(admin.progress.length, 1);
});

test("ended or expired hiring is explicit and does not create a request", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.roles[0].status = "ended";
  admin.roles[0].is_expired = true;

  const result = await runPriorityReview(admin);

  assert.equal(result.ok, false);
  assert.equal(result.status, "hiring_ended");
  assert.match(
    String(result.assistantInstruction),
    /Hiring for this exact role has ended/
  );
  assert.equal(admin.progress.length, 0);
});

test("an existing request explicitly identifies ended hiring", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.roles[0].status = "ended";
  admin.roles[0].is_expired = true;
  admin.progress = [
    {
      created_at: "2026-08-01T00:00:00.000Z",
      id: "request-1",
      kind: "candidate_requested_connection",
      role_id: ROLE_ID,
      talent_id: TALENT_ID,
    },
  ];

  const result = await runPriorityReview(admin);

  assert.equal(result.ok, true);
  assert.equal(result.status, "existing_request_hiring_ended");
  assert.match(
    String(result.assistantInstruction),
    /Hiring for this exact role has ended/
  );
  assert.equal(admin.progress.length, 1);
});

test("a missing fit still records the request and reports review in progress", async () => {
  const admin = new FakePriorityReviewAdmin();

  const result = await runPriorityReview(admin);

  assert.equal(result.status, "created");
  assert.equal(result.reviewState, "review_requested");
  assert.equal(admin.progress.length, 1);
  assert.equal(result.recommendationAvailable, false);
  assert.equal(result.companyShared, false);
});

for (const fit of [
  {role_fit:"middle",company_fit:"middle",candidate_fit:"middle"},
  {role_fit:"fit",company_fit:"fit",candidate_fit:"unfit"},
  {label:"hold",reevaluation_criteria:{question:"Private legacy question"}},
  {label:"hold",reevaluation_checked_at:"2026-09-01T00:00:00Z"},
]) {
  test(`legacy fit ${JSON.stringify(fit)} requests shared review without surfacing old questions`, async () => {
    const admin = new FakePriorityReviewAdmin();
    admin.fits = [{id:"legacy-fit",talent_id:TALENT_ID,opportunity_id:ROLE_ID,...fit}];
    const result = await runPriorityReview(admin);
    assert.equal(result.reviewState,"review_requested");
    assert.equal(result.recommendationAvailable,false);
    assert.equal(result.companyShared,false);
    assert.equal("clarificationQuestion" in result,false);
    assert.equal("reasoningOnlyCandidatePreferenceContext" in result,false);
    assert.equal(admin.progress.length,1);
  });
}

for (const candidateVisible of [false,true]) {
  test(`current shared fit uses stored selection (${candidateVisible}) without inferring acceptance`, async () => {
    const admin = new FakePriorityReviewAdmin();
    admin.fits = [{id:"v2-fit",talent_id:TALENT_ID,opportunity_id:ROLE_ID,
      fit_contract_version:"talent_role_fit_v2",candidate_visible:candidateVisible,priority_review_recommendable:candidateVisible,
      expires_at:"2099-01-01T00:00:00Z",evaluated_stage:2,input_fingerprint:"current-input",candidate_reason:"Relevant confirmed experience",role_fit:"good",candidate_fit:"good",company_fit:"good"}];
    const result = await runPriorityReview(admin);
    assert.equal(result.recommendationAvailable,candidateVisible);
    assert.equal("assessmentReviewable" in result,false);
    assert.equal("fitAssessment" in result,false);
    assert.equal(result.companyShared,false);
    assert.equal(admin.recommendations.length,0);
  });
}

test("an expired perfect role/company fit is recommended without prior selection or model judgment", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.fits=[{id:"v2-perfect",talent_id:TALENT_ID,opportunity_id:ROLE_ID,
    fit_contract_version:"talent_role_fit_v2",candidate_visible:false,priority_review_recommendable:true,
    expires_at:"2000-01-01T00:00:00Z",role_fit:"perfect",candidate_fit:"worth_considering",company_fit:"perfect"}];
  const result=await runPriorityReview(admin);
  assert.equal(result.recommendationAvailable,true);
  assert.equal(result.reviewState,"recommendation_available");
  assert.equal("fitAssessment" in result,false);
  assert.match(String(result.assistantInstruction),/do not make another recommendation eligibility decision/);
  const {executeTalentTool,TALENT_TOOL_NAMES}=await talentToolsPromise;
  const presented=await executeTalentTool({context:{admin:admin as never,userId:TALENT_ID},
    input:{feedback:"review",roleId:ROLE_ID,fitReasons:["Known experience matches the public role scope."]},
    logging:false,name:TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK}) as Row;
  assert.equal(presented.status,"recommended");
  assert.equal(presented.companyShared,false);
});

test("the model cannot present an unselected non-perfect fit after priority registration", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.fits=[{id:"v2-good",talent_id:TALENT_ID,opportunity_id:ROLE_ID,
    fit_contract_version:"talent_role_fit_v2",candidate_visible:false,priority_review_recommendable:false,
    expires_at:"2099-01-01T00:00:00Z",role_fit:"good",candidate_fit:"good",company_fit:"good"}];
  assert.equal((await runPriorityReview(admin)).recommendationAvailable,false);
  const {executeTalentTool,TALENT_TOOL_NAMES}=await talentToolsPromise;
  const result=await executeTalentTool({context:{admin:admin as never,userId:TALENT_ID},
    input:{feedback:"review",roleId:ROLE_ID,fitReasons:["The model thinks this role is suitable."]},
    logging:false,name:TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK}) as Row;
  assert.equal(result.blocked,true);
  assert.equal(result.reason,"internal_role_not_current_matched_option");
  assert.equal(admin.calls.some(call=>call.operation==="rpc"),false);
});

test("priority review never returns role summary regardless of response locale", async () => {
  const admin = new FakePriorityReviewAdmin();

  const result = await runPriorityReview(admin, null);

  assert.equal("roleSummary" in result, false);
});

test("an old request is archived in Inbox without becoming a rejection or a renewed request", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.progress = [
    {
      created_at: "2020-01-01T00:00:00.000Z",
      id: "request-old",
      kind: "candidate_requested_connection",
      role_id: ROLE_ID,
      talent_id: TALENT_ID,
    },
  ];
  admin.fits = [
    {
      human_label: "unfit",
      id: "fit-unfit",
      label: "fit",
      opportunity_id: ROLE_ID,
      reevaluation_criteria: null,
      talent_id: TALENT_ID,
    },
  ];

  const result = await runPriorityReview(admin);

  assert.equal(result.status, "already_exists");
  assert.equal(result.requestedAt, "2020-01-01T00:00:00.000Z");
  assert.equal(result.inboxArchived,true);
  assert.equal(result.companyReviewProposed,false);
  assert.equal(result.companyConnectionRequested,false);
  assert.equal(result.requestCreated,false);
  assert.equal("clarificationQuestion" in result,false);
  assert.equal(admin.progress.length, 1);
});

for (const decision of [null, "company_first", "no_action", "candidate_first", "both"]) {
  test(`four-week repeated register respects the ${decision ?? "unreviewed"} route`, async () => {
    const admin = new FakePriorityReviewAdmin();
    const requestedAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    admin.progress = [{ id: "request-old", created_at: requestedAt,
      kind: "candidate_requested_connection", role_id: ROLE_ID, talent_id: TALENT_ID }];
    if (decision) admin.matchingReviews = [{ talent_id: TALENT_ID, opportunity_id: ROLE_ID,
      priority_request_id: "request-old", reviewed_at: admin.insertedAt, closed_at: null, decision }];
    if (decision === "company_first") admin.companyProposals = [{ talent_id: TALENT_ID,
      role_id: ROLE_ID, status: "ready", requested_at: null }];
    const before = structuredClone(admin.progress);
    const result = await runPriorityReview(admin);
    assert.equal(result.inboxArchived === true, !["candidate_first", "both"].includes(decision ?? ""));
    assert.equal(result.requestCreated, false);
    assert.equal(result.requestedAt, requestedAt);
    assert.deepEqual(admin.progress, before);
    assert.equal(admin.calls.some(call => call.operation === "insert" && call.table !== "logs"), false);
    if (result.inboxArchived) {
      assert.equal(result.companyReviewProposed, decision === "company_first");
      assert.equal(result.companyConnectionRequested, false);
    }
  });
}

test("status returns the same archive facts without renewing or withdrawing the request", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.progress = [{ id: "request-old", created_at: "2020-01-01T00:00:00.000Z",
    kind: "candidate_requested_connection", role_id: ROLE_ID, talent_id: TALENT_ID }];
  const before = structuredClone(admin.progress);
  const result = await runPriorityReview(admin, "ko", undefined, "status");
  assert.equal(result.inboxArchived, true);
  assert.equal(result.requestCreated, false);
  assert.deepEqual(admin.progress, before);
  assert.equal(admin.calls.some(call => call.table !== "logs" && call.operation !== "select"), false);
});

test("an old request with an existing recommendation keeps the normal recommendation flow", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.progress = [{ id: "request-old", created_at: "2020-01-01T00:00:00.000Z",
    kind: "candidate_requested_connection", role_id: ROLE_ID, talent_id: TALENT_ID }];
  admin.recommendations = [{ id: "recommendation-1", talent_id: TALENT_ID, role_id: ROLE_ID,
    feedback: null, saved_stage: null }];
  assert.equal((await runPriorityReview(admin)).status, "already_formally_recommended");
  assert.equal((await runPriorityReview(admin, "ko", undefined, "status")).inboxArchived, undefined);
});

test("a company's actual introduction request is not archived by the chat tool", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.progress = [{ id: "request-old", created_at: "2020-01-01T00:00:00.000Z",
    kind: "candidate_requested_connection", role_id: ROLE_ID, talent_id: TALENT_ID }];
  admin.companyProposals = [{ talent_id: TALENT_ID, role_id: ROLE_ID,
    status: "awaiting_talent", requested_at: admin.insertedAt }];
  assert.equal((await runPriorityReview(admin)).inboxArchived, undefined);
});


test("withdraw preserves the request history and a later request has a new identity", async () => {
  const admin = new FakePriorityReviewAdmin();
  await runPriorityReview(admin);
  const oldId = admin.progress[0].id;
  const { executeTalentTool, TALENT_TOOL_NAMES } = await talentToolsPromise;
  await executeTalentTool({ context: { admin: admin as never, userId: TALENT_ID },
    input: {action:"withdraw",roleId:ROLE_ID}, logging:false,
    name:TALENT_TOOL_NAMES.INTERNAL_ROLE_PRIORITY_REVIEW });
  assert.equal(admin.progress.length,1);
  assert.ok((admin.progress[0].metadata as Row).withdrawnAt);
  const withdrawnHistory = structuredClone(admin.progress);
  admin.calls = [];
  const withdrawnStatus = await runPriorityReview(admin, "ko", undefined, "status");
  assert.equal(withdrawnStatus.status, "withdrawn");
  assert.equal(withdrawnStatus.hasActiveRequest, false);
  assert.equal(withdrawnStatus.requestCreated, false);
  assert.equal(withdrawnStatus.withdrawnAt, admin.insertedAt);
  assert.deepEqual(admin.progress, withdrawnHistory);
  assert.equal(admin.calls.some(call => call.table !== "logs" && call.operation !== "select"), false);
  await runPriorityReview(admin);
  assert.equal(admin.progress.length,2);
  assert.notEqual(admin.progress[1].id,oldId);
  const renewedStatus = await runPriorityReview(admin, "ko", undefined, "status");
  assert.equal(renewedStatus.hasActiveRequest, true);
  assert.equal(admin.progress.length, 2);
});

test("status of an unregistered request does not create one even without onboarding", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.settings = [{ user_id: TALENT_ID, is_onboarding_done: false }];
  admin.progress = [{ id: "someone-else", talent_id: "other-talent", role_id: ROLE_ID,
    kind: "candidate_requested_connection", created_at: admin.insertedAt }];
  const before = structuredClone(admin.progress);
  const result = await runPriorityReview(admin, "ko", undefined, "status");
  assert.equal(result.status, "not_registered");
  assert.equal(result.requestCreated, false);
  assert.equal(result.hasActiveRequest, false);
  assert.equal(result.requestedAt, null);
  assert.deepEqual(admin.progress, before);
  assert.equal(admin.calls.some(call => call.table !== "logs" && call.operation !== "select"), false);
});

test("status reads completed review facts without recommending or changing the request", async () => {
  const admin = new FakePriorityReviewAdmin();
  await runPriorityReview(admin);
  const requestId = admin.progress[0].id;
  admin.matchingReviews = [{ talent_id: TALENT_ID, opportunity_id: ROLE_ID,
    priority_request_id: requestId, reviewed_at: "2026-10-08T03:00:00.000Z", closed_at: null }];
  const before = structuredClone(admin.progress);
  admin.calls = [];
  const result = await runPriorityReview(admin, "ko", undefined, "status");
  assert.equal(result.status, "already_exists");
  assert.equal(result.reviewState, "reviewed");
  assert.equal(result.reviewedAt, "2026-10-08T03:00:00.000Z");
  assert.equal(result.requestCreated, false);
  assert.equal(admin.recommendations.length, 0);
  assert.deepEqual(admin.progress, before);
  assert.equal(admin.calls.some(call => call.table !== "logs" && call.operation !== "select"), false);
});
