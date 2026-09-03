import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchActiveInternalFitHoldQuestion,
  recordInternalFitReevaluationInformation,
} from "./internalFitHoldQuestion";

type FitRow = {
  created_at: string;
  human_label?: string | null;
  id: string;
  label: string;
  last_evaluated_at: string;
  opportunity_id: string;
  reevaluation_criteria: Record<string, unknown>;
  score: number;
};

class FakeQuery {
  private filters = new Map<string, unknown>();
  private inFilters = new Map<string, unknown[]>();
  private operation: "select" | "update" = "select";
  private payload: Record<string, unknown> | null = null;
  private selectedColumns = "";
  private resultLimit: number | null = null;

  constructor(
    private readonly admin: FakeAdmin,
    private readonly table: string
  ) {}

  select(columns: string) {
    this.operation = "select";
    this.selectedColumns = columns;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.inFilters.set(column, values);
    return this;
  }

  or(expression: string) {
    void expression;
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.resultLimit = value;
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    if (this.table === "company_roles") {
      return { data: this.admin.roles, error: null };
    }
    if (this.table === "talent_opportunity_recommendation") {
      const roleIds = this.inFilters.get("role_id");
      return {
        data: this.admin.recommendations.filter(
          (row) => !roleIds || roleIds.includes(row.role_id)
        ),
        error: null,
      };
    }
    if (this.table === "talent_progress") {
      const roleIds = this.inFilters.get("role_id");
      return {
        data: this.admin.priorityReviews.filter(
          (row) => !roleIds || roleIds.includes(row.role_id)
        ),
        error: null,
      };
    }
    if (this.table !== "talent_opportunity_fit") {
      return { data: [], error: null };
    }

    if (this.operation === "update") {
      const fitId = String(this.filters.get("id") ?? "");
      const fit = this.admin.fits.find((row) => row.id === fitId);
      if (fit && this.payload?.reevaluation_criteria) {
        fit.reevaluation_criteria = this.payload
          .reevaluation_criteria as Record<string, unknown>;
      }
      return { data: null, error: null };
    }

    let rows = this.admin.fits.filter(
      (row) =>
        !this.filters.has("label") || row.label === this.filters.get("label")
    );
    const ids = this.inFilters.get("id");
    if (ids) rows = rows.filter((row) => ids.includes(row.id));
    const opportunityIds = this.inFilters.get("opportunity_id");
    if (opportunityIds) {
      rows = rows.filter((row) => opportunityIds.includes(row.opportunity_id));
    }
    if (this.selectedColumns.includes("score")) {
      rows = rows.filter(
        (row) => !String(row.reevaluation_criteria.new_information ?? "").trim()
      );
    }
    if (this.resultLimit !== null) {
      rows = [...rows]
        .sort((left, right) => right.score - left.score)
        .slice(0, this.resultLimit);
    }
    return { data: rows.map((row) => ({ ...row })), error: null };
  }
}

class FakeAdmin {
  priorityReviews: Array<{ role_id: string }> = [];
  recommendations: Array<Record<string, unknown>> = [];

  fits: FitRow[] = [
    {
      created_at: "2026-08-01T00:00:00.000Z",
      id: "fit-thailand",
      label: "hold",
      last_evaluated_at: "2026-08-20T00:00:00.000Z",
      opportunity_id: "role-thailand",
      reevaluation_criteria: {
        question: "태국 이주 또는 현지 근무를 고려하고 계신가요?",
        topic: "location",
      },
      score: 75,
    },
    {
      created_at: "2026-08-01T00:00:00.000Z",
      id: "fit-singapore",
      label: "hold",
      last_evaluated_at: "2026-08-20T00:00:00.000Z",
      opportunity_id: "role-singapore",
      reevaluation_criteria: {
        question: "싱가포르 이주 또는 현지 근무를 고려하고 계신가요?",
        topic: "location",
      },
      score: 74,
    },
  ];

  roles = [
    {
      information: {},
      is_expired: false,
      role_id: "role-thailand",
      company_workspace_id: "company-1",
      source_type: "internal",
      status: "active",
    },
    {
      information: {},
      is_expired: false,
      role_id: "role-singapore",
      company_workspace_id: "company-1",
      source_type: "internal",
      status: "active",
    },
  ];

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

test("career asks one grouped location question and saves its answer to every fit", async () => {
  const admin = new FakeAdmin();
  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "en",
    userId: "talent-1",
  });

  assert.equal(active?.topic, "location");
  assert.deepEqual(active?.fitIds, ["fit-thailand", "fit-singapore"]);
  assert.equal(
    active?.summary,
    "태국 이주 또는 현지 근무를 고려하고 계신가요?"
  );

  const result = await recordInternalFitReevaluationInformation({
    admin: admin as never,
    fitId: "fit-thailand",
    newInformation: "한국 외에는 싱가포르와 일본을 고려할 수 있습니다.",
    source: "career_chat",
    userId: "talent-1",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.groupedFitIds, ["fit-thailand", "fit-singapore"]);
  for (const fit of admin.fits) {
    assert.equal(
      fit.reevaluation_criteria.new_information,
      "한국 외에는 싱가포르와 일본을 고려할 수 있습니다."
    );
    assert.equal(fit.reevaluation_criteria.topic, "location");
  }
});

test("career does not expose a single explicit hold as a grouped question", async () => {
  const admin = new FakeAdmin();
  admin.fits = admin.fits.slice(0, 1);
  admin.roles = admin.roles.slice(0, 1);

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "ko",
    userId: "talent-1",
  });

  assert.equal(active, null);
});

test("career exposes a single hold after the user requested priority review", async () => {
  const admin = new FakeAdmin();
  admin.fits = admin.fits.slice(0, 1);
  admin.roles = admin.roles.slice(0, 1);
  admin.priorityReviews = [{ role_id: "role-thailand" }];

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "ko",
    userId: "talent-1",
  });

  assert.equal(active?.fitId, "fit-thailand");
  assert.deepEqual(active?.fitIds, ["fit-thailand"]);
  assert.equal(
    active?.summary,
    "태국 이주 또는 현지 근무를 고려하고 계신가요?"
  );

  const result = await recordInternalFitReevaluationInformation({
    admin: admin as never,
    fitId: "fit-thailand",
    newInformation: "태국 현지 근무와 이주를 모두 고려할 수 있습니다.",
    source: "career_chat",
    userId: "talent-1",
  });

  assert.equal(result.ok, true);
  assert.equal(
    admin.fits[0]?.reevaluation_criteria.new_information,
    "태국 현지 근무와 이주를 모두 고려할 수 있습니다."
  );
});

test("career keeps the stored talent-facing question when no response locale is set", async () => {
  const admin = new FakeAdmin();
  admin.fits = admin.fits.slice(0, 1);
  admin.roles = admin.roles.slice(0, 1);
  admin.priorityReviews = [{ role_id: "role-thailand" }];

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: null,
    userId: "talent-1",
  });

  assert.equal(
    active?.summary,
    "태국 이주 또는 현지 근무를 고려하고 계신가요?"
  );
});

test("career ignores a human hold override for a requested role", async () => {
  const admin = new FakeAdmin();
  admin.fits = [
    {
      ...admin.fits[0],
      human_label: "hold",
      label: "fit",
    },
  ];
  admin.roles = admin.roles.slice(0, 1);
  admin.priorityReviews = [{ role_id: "role-thailand" }];

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "en",
    userId: "talent-1",
  });

  assert.equal(active, null);
});

test("career keeps a model hold even when human_label differs", async () => {
  const admin = new FakeAdmin();
  admin.fits = [
    {
      ...admin.fits[0],
      human_label: "fit",
      label: "hold",
    },
  ];
  admin.roles = admin.roles.slice(0, 1);
  admin.priorityReviews = [{ role_id: "role-thailand" }];

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "en",
    userId: "talent-1",
  });

  assert.equal(active?.fitId, "fit-thailand");
});

test("career keeps a requested hold active even when it is below the general candidate limit", async () => {
  const admin = new FakeAdmin();
  admin.fits = Array.from({ length: 21 }, (_, index) => ({
    created_at: "2026-08-01T00:00:00.000Z",
    id: `fit-${index}`,
    label: "hold",
    last_evaluated_at: "2026-08-20T00:00:00.000Z",
    opportunity_id: `role-${index}`,
    reevaluation_criteria: {
      question: `Would you consider location ${index}?`,
      topic: "location",
    },
    score: 100 - index,
  }));
  admin.roles = admin.fits.map((fit) => ({
    company_workspace_id: `company-${fit.id}`,
    information: {},
    is_expired: false,
    role_id: fit.opportunity_id,
    source_type: "internal",
    status: "active",
  }));
  admin.priorityReviews = [{ role_id: "role-20" }];

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "en",
    userId: "talent-1",
  });

  assert.equal(active?.fitId, "fit-20");
});

test("career does not expose legacy criteria without an explicit topic", async () => {
  const admin = new FakeAdmin();
  for (const fit of admin.fits) {
    delete fit.reevaluation_criteria.topic;
  }

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "ko",
    userId: "talent-1",
  });

  assert.equal(active, null);
});

test("career does not infer a question from a legacy summary field", async () => {
  const admin = new FakeAdmin();
  admin.fits = [
    {
      ...admin.fits[0],
      reevaluation_criteria: {
        summary: "Confirm whether Thailand is in scope.",
        topic: "location",
      },
    },
  ];
  admin.roles = admin.roles.slice(0, 1);
  admin.priorityReviews = [{ role_id: "role-thailand" }];

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "en",
    userId: "talent-1",
  });

  assert.equal(active, null);
});

test("career suppresses sibling hold questions after a recommendation at the company", async () => {
  const admin = new FakeAdmin();
  admin.recommendations = [
    {
      role_id: "another-role",
      company_role: {
        company_workspace_id: "company-1",
        source_type: "internal",
      },
    },
  ];

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "ko",
    userId: "talent-1",
  });

  assert.equal(active, null);
});

test("career does not ask a hold question after that exact role was recommended", async () => {
  const admin = new FakeAdmin();
  admin.fits = admin.fits.slice(0, 1);
  admin.roles = admin.roles.slice(0, 1);
  admin.priorityReviews = [{ role_id: "role-thailand" }];
  admin.recommendations = [
    {
      role_id: "role-thailand",
      company_role: {
        company_workspace_id: "company-1",
        source_type: "internal",
      },
    },
  ];

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "ko",
    userId: "talent-1",
  });

  assert.equal(active, null);
});

test("a test-only recommendation does not suppress real company questions", async () => {
  const admin = new FakeAdmin();
  admin.recommendations = [
    {
      role_id: "test-role",
      company_role: {
        company_workspace_id: "company-1",
        information: { testOnly: true },
        source_type: "internal",
      },
    },
  ];

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "ko",
    userId: "talent-1",
  });

  assert.equal(active?.topic, "location");
  assert.deepEqual(active?.fitIds, ["fit-thailand", "fit-singapore"]);
});

test("an external recommendation at the company does not suppress internal questions", async () => {
  const admin = new FakeAdmin();
  admin.recommendations = [
    {
      role_id: "public-role",
      company_role: {
        company_workspace_id: "company-1",
        information: {},
        source_type: "external",
      },
    },
  ];

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: admin as never,
    locale: "ko",
    userId: "talent-1",
  });

  assert.equal(active?.topic, "location");
});
