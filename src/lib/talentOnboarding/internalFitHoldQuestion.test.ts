import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchActiveInternalFitHoldQuestion,
  recordInternalFitReevaluationInformation,
} from "./internalFitHoldQuestion";

type FitRow = {
  created_at: string;
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

  order() {
    return this;
  }

  limit() {
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
      return { data: [], error: null };
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
      (row) => !this.filters.has("label") || row.label === this.filters.get("label")
    );
    const ids = this.inFilters.get("id");
    if (ids) rows = rows.filter((row) => ids.includes(row.id));
    if (this.selectedColumns.includes("score")) {
      rows = rows.filter(
        (row) => !String(row.reevaluation_criteria.new_information ?? "").trim()
      );
    }
    return { data: rows.map((row) => ({ ...row })), error: null };
  }
}

class FakeAdmin {
  fits: FitRow[] = [
    {
      created_at: "2026-08-01T00:00:00.000Z",
      id: "fit-thailand",
      label: "hold",
      last_evaluated_at: "2026-08-20T00:00:00.000Z",
      opportunity_id: "role-thailand",
      reevaluation_criteria: {
        summary: "Confirm whether Thailand is in scope.",
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
        summary: "Confirm whether Singapore is in scope.",
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
      source_type: "internal",
      status: "active",
    },
    {
      information: {},
      is_expired: false,
      role_id: "role-singapore",
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
  assert.match(active?.summary ?? "", /countries or regions/i);

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
