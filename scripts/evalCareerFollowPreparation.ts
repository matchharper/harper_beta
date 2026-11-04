import { config } from "dotenv";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import Module from "node:module";
config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
const task = "docs/evaluation/career-follow-preparation";
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const datasetArg = process.argv.indexOf("--dataset");
const dataset = datasetArg >= 0 ? process.argv[datasetArg + 1] : "v2";
assert.ok(["v1", "v2"].includes(dataset));
const frozen = JSON.parse(
  readFileSync(`${task}/manifest-${dataset}.json`, "utf8")
);
for (const [file, digest] of Object.entries(frozen.hashes))
  assert.equal(hash(readFileSync(`${task}/${file}`)), digest);
const fixtures = JSON.parse(
  readFileSync(`${task}/cases-${dataset}.json`, "utf8")
);
async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-"),
    directory = `${task}/runs/${runId}`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) =>
    writeFileSync(`${directory}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  const network = new AsyncLocalStorage<any>(),
    originalFetch = globalThis.fetch;
  const modules = Module as unknown as { _load: (...args: any[]) => any },
    originalLoad = modules._load;
  modules._load = function (request: string, ...args: any[]) {
    return request === "server-only"
      ? {}
      : originalLoad.call(this, request, ...args);
  };
  globalThis.fetch = async (url, init) => {
    if (new URL(String(url)).hostname !== "api.openai.com")
      throw new Error("Evaluation allows only model-provider network");
    const scope = network.getStore();
    if (init?.body) scope?.requests.push(JSON.parse(String(init.body)));
    const response = await originalFetch(url, {
      ...init,
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(120000),
      ]),
    });
    scope?.responses.push(
      await response
        .clone()
        .json()
        .catch(() => ({ status: response.status }))
    );
    return response;
  };
  try {
    const { followDatabase, followAdmin, id } =
      await import("../src/lib/career/companies/preparation.testSupport");
    const { readPreparedFollowContext } =
      await import("../src/lib/career/companies/preparation");
    const { CareerCapabilityRuntime } =
      await import("../src/lib/career/capabilities/runtime");
    const { resolveCareerChatTools } =
      await import("../src/lib/career/llmTools");
    const { runCareerChatAssistant } = await import("../src/lib/career/llm");
    const { renderCareerBackgroundInvocation } =
      await import("../src/lib/career/background/prompt");
    const { CAREER_COMPANY_TOOLS } =
      await import("../src/lib/career/companies/tools");
    const sources = [
      "scripts/evalCareerFollowPreparation.ts",
      "src/lib/career/companies/inventory.ts",
      "src/lib/career/companies/preparation.ts",
      "src/lib/career/prompts/toolPolicyPrompt.ts",
      "src/lib/llm/toolDescriptions.ts",
      "src/lib/talentOnboarding/tools.ts",
      "src/lib/career/handbooks/opportunitySearch.ts",
      "src/lib/career/prompts/mainPrompt2.ts",
      "src/lib/career/handbooks/proactiveCareer.ts",
      "src/lib/career/capabilities/registry.ts",
      "src/lib/career/background/prompt.ts",
    ];
    const manifest: any = {
      runId,
      datasetVersion: dataset,
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      dirty: true,
      model: "gpt-6-luna",
      reasoning: "high",
      fixtureHashes: frozen.hashes,
      sourceHashes: Object.fromEntries(
        sources.map((file) => [file, hash(readFileSync(file))])
      ),
      cases: [],
    };
    save("manifest", manifest);
    const onlyIndex = process.argv.indexOf("--only"),
      only = onlyIndex >= 0 ? process.argv[onlyIndex + 1].split(",") : null;
    for (const scenario of fixtures.cases.filter(
      (item: any) => !only || only.includes(item.id)
    )) {
      const db = await followDatabase(),
        admin = followAdmin(db),
        trace: any = { scenario, requests: [], responses: [], executions: [] };
      try {
        await db.query("delete from company_roles where role_id<>$1", [id(30)]);
        await db.query(
          "update company_roles set posted_at=$1,created_at=$1 where role_id=$2",
          ["2026-11-01", id(30)]
        );
        await db.query(
          "insert into talent_external_evaluations values($1,$2,$3,$4,$5,$6)",
          [
            id(50),
            id(1),
            id(30),
            id(60),
            JSON.stringify({
              fit: {
                mutualFit: scenario.score,
                candidateInterest: scenario.score,
                companyInterest: scenario.score,
                roleFit: scenario.score,
                constraintPass: scenario.score,
                evidence: "sufficient",
              },
            }),
            "2026-11-01",
          ]
        );
        if (scenario.roleKnown)
          await db.query(
            "insert into talent_opportunity_recommendation values(1,$1,$2)",
            [id(1), id(30)]
          );
        await db.query(
          "insert into company_hiring_search_cache(cache_key,evidence,checked_at) values($1,$2,$3)",
          [
            "company:1",
            JSON.stringify({
              query: "Atlas hiring recruitment announcements",
              results: scenario.news,
            }),
            "2026-11-02T00:00:00Z",
          ]
        );
        trace.context = await readPreparedFollowContext(admin, id(1));
        const facts = `Current Brief: 서울 플랫폼 엔지니어, 하이브리드. Profile: 윤서, 6 years Kubernetes operations and deployment automation. Default profile ${id(3)} revision 4. Current matching ${id(4)} revision 1, list revision list-1. Contact permissions enabled. No applications or company obligations. Current check-in is active, every 7 days. Saved instruction: Followed companies only; contact for useful new roles or actual hiring announcements. No broad market search requested.\n${scenario.history}`;
        const invocation: any = {
          id: id(40),
          talent_id: id(1),
          status: "handed_off",
          trigger: "career_schedule_due",
          created_at: fixtures.requestTime,
          trigger_payload: {
            instruction:
              "Check the followed companies using the saved scope and contact only when useful.",
            sourceEvents: [
              {
                sourceKind: "schedule",
                sourceId: id(80),
                revision: 1,
                instruction:
                  "팔로우한 회사의 좋은 공고나 실제 추가 채용 소식만 알려줘.",
              },
            ],
          },
        };
        const eligible = resolveCareerChatTools({
          channel: "chat",
          isOnboardingDone: true,
          background: true,
          hasActiveGmailIntegration: false,
          responseLocale: "ko",
        }).tools;
        const runtime = new CareerCapabilityRuntime({
          mode: "progressive",
          replyId: `follow-eval:${scenario.id}`,
          eligibleTools: eligible,
          preloads: ["schedules", "career_delivery"],
          selection: {
            capabilityIds: [],
            handbookIds: ["proactive_career"],
            status: "selected",
            elapsedMs: 0,
          },
          promptArgs: () => ({
            channel: "chat",
            isOnboardingDone: true,
            backgroundInvocation: true,
            profile: null,
            structuredProfileText: "윤서, 서울의 6년차 플랫폼 엔지니어",
            talentContextSection: facts,
            runtimeInstruction: [
              renderCareerBackgroundInvocation(invocation),
              trace.context,
              `Recent actual email history: ${scenario.history}`,
            ].join("\n\n"),
            requestTime: new Date(fixtures.requestTime),
            timeZone: "Asia/Seoul",
            currentPreferences: {
              preferredLocale: "ko",
              getExternalRecommendation: true,
              profileVisibility: "open_to_matches",
              talentSettingStatus: "active",
            },
          }),
        });
        const executeTool = async ({
          name,
          input,
        }: {
          name: string;
          input: Record<string, unknown>;
        }) => {
          trace.executions.push({ name, input });
          if (name === "follow_company")
            return CAREER_COMPANY_TOOLS[name].execute!(input, {
              admin,
              userId: id(1),
            } as any);
          if (name === "deliver_career_email" || name === "contact_user")
            return {
              status: "sent",
              modelOutput:
                "Synthetic receipt: email recorded in this evaluation. No real email was sent.",
            };
          if (
            ["list_matchings", "read_matching", "upsert_matching"].includes(
              name
            )
          )
            return {
              modelOutput: `Matching ${id(4)}; revision 1; current list revision list-1. Platform engineering in Seoul. Existing recommendation ${scenario.roleKnown ? "1" : "none"}.`,
            };
          if (name === "upsert_opportunities")
            return {
              modelOutput: `Role ${id(30)} is saved in matching ${id(4)}; recommendation 1. List revision list-2. Career URL https://www.matchharper.com/career`,
            };
          if (
            [
              "search_opportunities",
              "get_role_context",
              "read_recommended_opportunities",
            ].includes(name)
          )
            return {
              modelOutput: `Saved evaluation ${id(50)}; run ${id(60)}; role ${id(30)}; mutualFit ${scenario.score}. ${scenario.score > 50 ? "Atlas platform engineer, Kubernetes, Seoul hybrid, 6+ years, active." : "Mobile engineering role, does not match the current platform profile."} No other useful roles in the delegated scope. ${scenario.history}`,
            };
          if (name === "open_url")
            return {
              modelOutput:
                scenario.sourcePage ??
                `Verified official hiring page, https://atlas.example/careers/platform-2026: platform engineer applications open until November 15, 2026; Seoul hybrid, Kubernetes and deployment automation, 6+ years.`,
            };
          if (name === "web_search")
            return {
              modelOutput:
                "No additional hiring announcements or new roles in the delegated scope.",
            };
          if (
            [
              "read_talent_context",
              "list_profiles",
              "read_profile",
              "list_schedules",
              "read_schedule",
            ].includes(name)
          )
            return { modelOutput: facts };
          throw new Error(`Synthetic fixture does not implement ${name}`);
        };
        const step = runtime.resolveStep(false);
        trace.reply = await network.run(trace, () =>
          runCareerChatAssistant({
            primaryModel: "gpt-6-luna",
            openAIResponsesReasoningEffort: "high",
            responseLocale: "ko",
            messages: [],
            tools: step.tools,
            systemBlocks: step.systemBlocks,
            toolRuntime: runtime,
            executeTool,
            abortSignal: AbortSignal.timeout(300000),
            usageLabel: `eval/career-follow-preparation/${scenario.id}`,
          })
        );
        trace.status = "completed";
      } catch (error) {
        trace.status = "failed";
        trace.error = String(error);
      } finally {
        await db.close();
        save(scenario.id, trace);
      }
      const summary = {
        id: scenario.id,
        status: trace.status,
        error: trace.error,
        calls: trace.executions.map((x: any) => x.name),
        providerRequests: trace.requests.length,
        deliveries: trace.executions
          .filter(
            (x: any) =>
              (x.name === "deliver_career_email" || x.name === "contact_user") &&
              (x.input.action ?? "deliver") === "deliver"
          )
          .map((x: any) => x.input),
      };
      manifest.cases.push(summary);
      save("manifest", manifest);
      console.log(JSON.stringify(summary));
    }
    console.log(directory);
  } finally {
    globalThis.fetch = originalFetch;
    modules._load = originalLoad;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
