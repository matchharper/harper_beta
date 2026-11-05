import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { dayKey } from "./calendar";
import { EXPERIMENT, V2_RUN_VERSION, externalVariant } from "./contract";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const selected = [
  {
    card: {
      roleId: id(10),
      companyWorkspaceId: id(11),
      companyName: "Synthetic",
      roleName: "Engineer",
      row: { external_jd_url: "https://synthetic.invalid/job" },
    },
    score: 64.25,
    fitSummary: "Role facts",
    recommendationNote: "Relevant experience",
  },
];

class Fixture {
  runs: any[] = [];
  saved: any[] = [];
  calls: any[] = [];
  initialRun: unknown = null;
  dailyEnabled = true;
  cacheInsufficient = false;
  engineError: Error | null = null;
  legacyCalls = 0;
  admin: any = {
    from: (table: string) => {
      assert.equal(table, "external_recommendation_runs");
      let inserted: any;
      let patch: any;
      const filters: ((row: any) => boolean)[] = [];
      const execute = () => {
        const rows = inserted
          ? [inserted]
          : this.runs.filter((row) => filters.every((f) => f(row)));
        if (patch) rows.forEach((row) => Object.assign(row, patch));
        return { data: rows[0] ?? null, error: null };
      };
      const query: any = {
        insert: (row: any) => {
          inserted = {
            id: id(100 + this.runs.length),
            status: "running",
            ...row,
          };
          this.runs.push(inserted);
          return query;
        },
        update: (values: any) => {
          patch = values;
          return query;
        },
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        neq: (key: string, value: unknown) => {
          filters.push((row) => row[key] !== value);
          return query;
        },
        single: async () => execute(),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(execute()).then(resolve),
      };
      return query;
    },
    rpc: async (name: string, args: any) => {
      const run = this.runs.find((r) => r.id === args.p_run_id);
      assert.ok(run);
      if (name === "claim_daily_external_run") {
        if (run.status !== "running") return { data: null, error: null };
        run.lease_token = args.p_token;
        return { data: { ...run }, error: null };
      }
      assert.equal(name, "complete_external_recommendation_run");
      if (run.surface === "daily")
        assert.equal(args.p_lease_token, run.lease_token);
      this.saved.push(...args.p_rows);
      run.status = "completed";
      return {
        data: args.p_rows.map((r: any) => ({
          id: id(200),
          role_id: r.role_id,
        })),
        error: null,
      };
    },
  };

  queueDaily() {
    const run = {
      id: id(100),
      talent_id: id(1),
      surface: "daily",
      variant: "control",
      experiment: EXPERIMENT,
      status: "running",
      provider: "openai",
      locale: "en",
      time_zone: "Asia/Seoul",
      day_key: dayKey("Asia/Seoul"),
      attempts: 1,
    };
    this.runs.push(run);
    return run;
  }
}

test("all recommendation entrypoints execute V2 despite old cohorts and settings", async (t) => {
  let fixture = new Fixture();
  const modules = Module as any;
  const original = modules._load;
  const oldFlag = process.env.EXTERNAL_RECOMMENDATION_EXPERIMENT;
  process.env.EXTERNAL_RECOMMENDATION_EXPERIMENT = "off";
  t.after(() => {
    if (oldFlag === undefined)
      delete process.env.EXTERNAL_RECOMMENDATION_EXPERIMENT;
    else process.env.EXTERNAL_RECOMMENDATION_EXPERIMENT = oldFlag;
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Network forbidden in rollout test");
  });
  t.mock.method(
    modules,
    "_load",
    function (this: unknown, name: string, ...args: any[]) {
      if (name === "./engine")
        return {
          runExternalV2: async (input: any) => {
            fixture.calls.push(input);
            if (fixture.engineError) throw fixture.engineError;
            const insufficient = input.cachedOnly && fixture.cacheInsufficient;
            return {
              provider: "openai",
              selected: insufficient ? [] : selected,
              metrics: { candidateCount: 500, cacheInsufficient: insufficient },
              plan: { plan: { searchIntentSummary: "Current request" } },
            };
          },
        };
      if (name === "./context")
        return {
          loadExternalContext: async () => ({
            dailyEnabled: fixture.dailyEnabled,
          }),
        };
      if (name === "../talentOnboarding/admin")
        return { getTalentSupabaseAdmin: () => fixture.admin };
      if (name === "../talentOnboarding/initialRecommendationGuard")
        return {
          fetchActiveInitialConversationRun: async () => fixture.initialRun,
          buildInitialRecommendationPendingResult: () => ({ pending: true }),
        };
      if (name === "../talentOnboarding/jobPostingRecommendations")
        return {
          runCareerJobPostingRecommendations: async (input: any) => {
            fixture.legacyCalls++;
            assert.equal(input.evaluation?.dryRun, true);
            return { evaluation: true };
          },
        };
      if (name === "../talentOpportunity") return {};
      if (name === "@vercel/queue" || name === "next/server") return {};
      return original.call(this, name, ...args);
    }
  );
  const { runExperimentJobRecommendations } = await import("./web");
  const { runWorkerExternalSearch } = await import("./worker");
  const { processDailyRun } = await import("./daily");
  const { createRun } = await import("./runs");
  const webArgs = (userId: string) => ({
    admin: fixture.admin,
    userId,
    conversationId: id(9),
    request: "Find current roles",
    preferredLocale: "en",
  });
  const workerArgs = (userId: string) => ({
    admin: fixture.admin,
    userId,
    surface: "worker" as const,
    language: "en" as const,
  });

  await t.test(
    "web and worker persist V2 for both historical cohorts",
    async () => {
      assert.equal(externalVariant(id(0)), "v2");
      assert.equal(externalVariant(id(1)), "control");
      for (const userId of [id(0), id(1)]) {
        fixture = new Fixture();
        const web: any = await runExperimentJobRecommendations(webArgs(userId));
        assert.deepEqual(web.postingRoleIds, [id(10)]);
        assert.equal(
          JSON.parse(web.answerDraft).recommendations[0].recommendationNote,
          "Relevant experience"
        );
        assert.equal(fixture.saved[0].evidence.externalVersion, "v2");
        const worker = await runWorkerExternalSearch(workerArgs(userId));
        assert.equal(worker.cards[0].externalVersion, "v2");
        assert.deepEqual(
          fixture.calls.map((c) => c.surface),
          ["web", "worker"]
        );
        assert.equal(fixture.legacyCalls, 0);
        assert.ok(
          fixture.runs.every(
            (r) => r.variant === "v2" && r.experiment === V2_RUN_VERSION
          )
        );
      }
    }
  );
  await t.test(
    "a caller cannot create a new control run through extra metadata",
    async () => {
      fixture = new Fixture();
      await createRun(fixture.admin, id(1), "worker", {
        variant: "control",
        experiment: EXPERIMENT,
      });
      assert.equal(fixture.runs[0].variant, "v2");
      assert.equal(fixture.runs[0].experiment, V2_RUN_VERSION);
    }
  );
  await t.test(
    "V2 failures remain failures without legacy fallback or saved recommendations",
    async () => {
      for (const surface of ["web", "worker"] as const) {
        fixture = new Fixture();
        fixture.engineError = new Error("Synthetic V2 error");
        await assert.rejects(
          surface === "web"
            ? runExperimentJobRecommendations(webArgs(id(1)))
            : runWorkerExternalSearch(workerArgs(id(1))),
          /Synthetic V2 error/
        );
        assert.equal(fixture.runs[0].status, "failed");
        assert.equal(fixture.legacyCalls, 0);
        assert.equal(fixture.saved.length, 0);
      }
    }
  );
  await t.test("worker execution still checks run ownership", async () => {
    fixture = new Fixture();
    const run = await createRun(fixture.admin, id(0), "worker");
    await assert.rejects(
      runWorkerExternalSearch({
        ...workerArgs(id(1)),
        experimentRunId: run.id,
      }),
      /Invalid worker experiment/
    );
    assert.equal(fixture.calls.length, 0);
  });
  await t.test(
    "queued control daily runs use V2 cache and search with the same completion lease",
    async () => {
      for (const cacheInsufficient of [false, true]) {
        fixture = new Fixture();
        fixture.cacheInsufficient = cacheInsufficient;
        const run = fixture.queueDaily();
        await processDailyRun({ runId: run.id }, fixture.admin);
        assert.equal(run.variant, "v2");
        assert.equal(run.experiment, V2_RUN_VERSION);
        assert.equal(run.status, "completed");
        assert.equal(fixture.saved[0].evidence.externalVersion, "v2");
        assert.equal(fixture.calls.length, cacheInsufficient ? 2 : 1);
        assert.equal(fixture.calls[0].cachedOnly, true);
        assert.equal(fixture.legacyCalls, 0);
        await processDailyRun({ runId: run.id }, fixture.admin);
        assert.equal(fixture.saved.length, 1);
      }
    }
  );
  await t.test(
    "daily opt-out, initial onboarding and stale-day guards still skip generation",
    async () => {
      for (const guard of ["disabled", "initial", "stale"] as const) {
        fixture = new Fixture();
        const run = fixture.queueDaily();
        if (guard === "disabled") fixture.dailyEnabled = false;
        if (guard === "initial") fixture.initialRun = { id: id(50) };
        if (guard === "stale") run.day_key = "2000-01-01";
        await processDailyRun({ runId: run.id }, fixture.admin);
        assert.equal(run.status, "skipped");
        assert.equal(fixture.calls.length, 0);
        assert.equal(fixture.saved.length, 0);
      }
    }
  );
  await t.test(
    "legacy evaluation is limited to explicit dry runs",
    async () => {
      fixture = new Fixture();
      await runExperimentJobRecommendations({
        ...webArgs(id(1)),
        evaluation: { dryRun: true },
      });
      assert.equal(fixture.legacyCalls, 1);
      assert.equal(fixture.runs.length, 0);
      await runExperimentJobRecommendations({
        ...webArgs(id(1)),
        evaluation: { dryRun: false },
      });
      assert.equal(fixture.legacyCalls, 1);
      assert.equal(fixture.runs[0].variant, "v2");
    }
  );
});
