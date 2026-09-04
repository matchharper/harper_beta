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

  order() {
    return this;
  }

  limit() {
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
      ([column, value]) => row[column] === value
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

    return { data: rows.filter((row) => this.matches(row)), error: null };
  }
}

class FakePriorityReviewAdmin {
  calls: Array<{ operation: string; table: string }> = [];
  fits: Row[] = [];
  insertedAt = "2026-09-02T00:00:00.000Z";
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
    if (table === "company_roles") return this.roles;
    if (table === "official_jobs") return this.officialJobs;
    if (table === "talent_opportunity_fit") return this.fits;
    if (table === "talent_opportunity_recommendation") {
      return this.recommendations;
    }
    if (table === "talent_opportunity_tag") return this.tags;
    if (table === "talent_progress") return this.progress;
    return [];
  }

  replaceRows(table: string, rows: Row[]) {
    if (table === "talent_progress") this.progress = rows;
  }
}

async function runPriorityReview(
  admin: FakePriorityReviewAdmin,
  responseLocale: string | null = "ko"
) {
  const { executeTalentTool, TALENT_TOOL_NAMES } = await talentToolsPromise;
  return (await executeTalentTool({
    context: {
      admin: admin as never,
      responseLocale,
      userId: TALENT_ID,
    },
    input: { action: "register", roleId: ROLE_ID },
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
  assert.equal(firstCallDataOperations.length, 7);
  assert.equal(allDataOperations.length - firstCallDataOperations.length, 6);
  assert.equal("effectiveFitLabel" in created, false);
  assert.equal("reevaluationCriteria" in created, false);
  assert.match(String(created.assistantInstruction), /Do not explain the JD/);
  assert.doesNotMatch(
    String(created.assistantInstruction),
    /longer and more detailed/
  );
});

test("a mapped official job company name overrides the internal workspace and review group names", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.roles[0].company_workspace = {
    company_name: "Harper",
    published_name: "Harper",
  };
  admin.roles[0].information = {
    priorityReviewGroupName: "All FDE Positions",
  };
  admin.officialJobs = [
    {
      company_name: "Unified Hiring",
      is_published: true,
      role_id: ROLE_ID,
      updated_at: "2026-09-04T00:00:00.000Z",
    },
  ];

  const result = await runPriorityReview(admin);

  assert.equal(result.companyName, "Unified Hiring");
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
      created_at: "2026-08-01T00:00:00.000Z",
      id: "request-1",
      kind: "candidate_requested_connection",
      role_id: ROLE_ID,
      talent_id: TALENT_ID,
    },
  ];

  const result = await runPriorityReview(admin);

  assert.equal(result.status, "already_exists");
  assert.equal(result.requestedAt, "2026-08-01T00:00:00.000Z");
  assert.match(
    String(result.assistantInstruction),
    /existing priority-review request remains recorded/
  );
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
  assert.equal(result.reviewState, "fit_review_in_progress");
  assert.equal(admin.progress.length, 1);
  assert.match(String(result.assistantInstruction), /under review/);
  assert.match(
    String(result.assistantInstruction),
    /not a general job-board feed/
  );
});

test("B middle returns a candidate-preference explanation and reconsideration option", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.fits = [
    {
      candidate_fit: "middle",
      company_fit: "fit",
      human_label: null,
      id: "fit-middle",
      label: "ambiguous",
      opportunity_id: ROLE_ID,
      reason:
        "The candidate preferred core research over customer-facing delivery.",
      reevaluation_checked_at: "2026-09-01T00:00:00.000Z",
      reevaluation_criteria: null,
      role_fit: "fit",
      talent_id: TALENT_ID,
    },
  ];

  const result = await runPriorityReview(admin);

  assert.equal(result.candidatePreferenceMismatch, true);
  assert.equal(result.candidatePreferenceState, "middle");
  assert.match(
    String(result.reasoningOnlyCandidatePreferenceContext),
    /preferred core research/
  );
  assert.equal(result.reconsiderationAvailable, true);
  assert.equal(result.reconsiderationScheduled, false);
  assert.equal(result.reviewState, "candidate_preference_mismatch");
  assert.match(String(result.assistantInstruction), /lower priority/);
  assert.match(
    String(result.assistantInstruction),
    /request_internal_role_reconsideration/
  );
});

test("B unfit is explained as a preference mismatch but cannot be reconsidered", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.fits = [
    {
      candidate_fit: "unfit",
      company_fit: "fit",
      human_label: null,
      id: "fit-unfit-preference",
      label: "dissatisfied",
      opportunity_id: ROLE_ID,
      reason: "The candidate explicitly ruled out customer-facing roles.",
      role_fit: "fit",
      talent_id: TALENT_ID,
    },
  ];

  const result = await runPriorityReview(admin);

  assert.equal(result.candidatePreferenceMismatch, true);
  assert.equal(result.candidatePreferenceState, "unfit");
  assert.equal(result.reconsiderationAvailable, false);
  assert.match(String(result.assistantInstruction), /strong current/);
  assert.doesNotMatch(
    String(result.assistantInstruction),
    /call request_internal_role_reconsideration/
  );
});

test("priority review reports an already scheduled role reconsideration", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.fits = [
    {
      candidate_fit: "middle",
      company_fit: "fit",
      human_label: null,
      id: "fit-reconsidering",
      label: "ambiguous",
      opportunity_id: ROLE_ID,
      reevaluation_checked_at: null,
      reevaluation_criteria: {
        new_information:
          "Treat research-team preference as lower priority here.",
      },
      role_fit: "fit",
      talent_id: TALENT_ID,
    },
  ];

  const result = await runPriorityReview(admin);

  assert.equal(result.reconsiderationScheduled, true);
  assert.equal(result.reviewState, "reconsideration_scheduled");
  assert.match(
    String(result.assistantInstruction),
    /scheduled for reconsideration/
  );
  assert.doesNotMatch(String(result.assistantInstruction), /ask the returned/);
});

test("priority review never returns role summary regardless of response locale", async () => {
  const admin = new FakePriorityReviewAdmin();

  const result = await runPriorityReview(admin, null);

  assert.equal("roleSummary" in result, false);
});

test("hold returns only a candidate-safe clarification question", async () => {
  const admin = new FakePriorityReviewAdmin();
  admin.fits = [
    {
      human_label: null,
      id: "fit-hold",
      label: "hold",
      opportunity_id: ROLE_ID,
      reevaluation_criteria: {
        question:
          "Which countries or regions could you work from for this role?",
        reason: "Private company-side reason that must stay hidden.",
        summary: "Private location criterion.",
        topic: "location",
      },
      talent_id: TALENT_ID,
    },
  ];

  const result = await runPriorityReview(admin, null);

  assert.match(String(result.clarificationQuestion), /countries or regions/i);
  assert.equal("clarificationFitId" in result, false);
  assert.equal("clarificationTopic" in result, false);
  assert.doesNotMatch(
    String(result.clarificationQuestion),
    /Private company-side reason/
  );
});

test("an old non-fit request uses the current company-criteria explanation", async () => {
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
  assert.match(
    String(result.assistantInstruction),
    /not a problem with the candidate/
  );
  assert.match(
    String(result.assistantInstruction),
    /company revises its criteria/
  );
  assert.equal(admin.progress.length, 1);
});
