import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import Module from "node:module";
config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
const task = "docs/evaluation/career-daily-processing";
const dataset = process.argv.includes("--dataset") ? process.argv[process.argv.indexOf("--dataset") + 1] : "v1";
const frozen = JSON.parse(readFileSync(`${task}/manifest-${dataset}.json`, "utf8"));
for (const [file, hash] of Object.entries(frozen.hashes))
  assert.equal(
    createHash("sha256")
      .update(readFileSync(`${task}/${file}`))
      .digest("hex"),
    hash
  );
const fixtures = JSON.parse(readFileSync(`${task}/cases-${dataset}.json`, "utf8"));
const directory = `${task}/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(directory, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) =>
  writeFileSync(`${directory}/${name}.json`, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
const modules = Module as any,
  originalLoad = modules._load;
modules._load = function (request: string, ...args: any[]) {
  return request === "server-only"
    ? {}
    : originalLoad.call(this, request, ...args);
};
async function main() {
  const { CareerCapabilityRuntime } =
    await import("../src/lib/career/capabilities/runtime");
  const { resolveCareerChatTools } = await import("../src/lib/career/llmTools");
  const { runCareerChatAssistant } = await import("../src/lib/career/llm");
  const { renderCareerBackgroundInvocation } =
    await import("../src/lib/career/background/prompt");
  const { formatCompanyIntroContext } =
    await import("../src/lib/career/background/companyIntro");
  const { careerContactSourceIds } =
    await import("../src/lib/career/background/sourceCoverage");
  const { resolveCareerTextChatModel } =
    await import("../src/lib/career/textChatModelConfig");
  const { GPT_6_LUNA_MODEL } = await import("../src/lib/llm/modelConfig");
  const model =
    process.env.CAREER_SCHEDULED_AGENT_MODEL?.trim() || GPT_6_LUNA_MODEL;
  const files = [
    "scripts/evalCareerDailyProcessing.ts",
    "src/lib/career/background/prompt.ts",
    "src/lib/career/background/companyIntro.ts",
    "src/lib/career/handbooks/proactiveCareer.ts",
    "src/lib/career/handbooks/opportunitySearch.ts",
    "src/lib/llm/toolDescriptions.ts",
    "src/lib/career/capabilities/registry.ts",
    "src/lib/career/prompts/mainPrompt2.ts",
  ];
  save("manifest", {
    model,
    reasoning: "high",
    frozen,
    hashes: Object.fromEntries(
      files.map((f) => [
        f,
        createHash("sha256").update(readFileSync(f)).digest("hex"),
      ])
    ),
  });
  const originalFetch = globalThis.fetch;
  for (const scenario of fixtures.cases.filter(
    (s: any) =>
      !process.argv.includes("--only") ||
      process.argv[process.argv.indexOf("--only") + 1].split(",").includes(s.id)
  )) {
    const currentModel =
      ["agent_contact_received", "immediate_opportunity_requested"].includes(scenario.trigger)
        ? resolveCareerTextChatModel(undefined).model
        : model;
    const trace: any = {
      scenario,
      model: currentModel,
      executions: [],
      requests: [],
      responses: [],
    };
    globalThis.fetch = async (url, init) => {
      if (new URL(String(url)).hostname !== "api.openai.com")
        throw Error("Only model provider network permitted");
      if (init?.body) trace.requests.push(JSON.parse(String(init.body)));
      const response = await originalFetch(url, {
        ...init,
        signal: AbortSignal.any([
          ...(init?.signal ? [init.signal] : []),
          AbortSignal.timeout(120000),
        ]),
      });
      trace.responses.push(
        await response
          .clone()
          .json()
          .catch(() => ({ status: response.status }))
      );
      return response;
    };
    const facts = scenario.facts ??
      "Candidate 윤서, Korean, Seoul platform engineer, 6 years Kubernetes and deployment automation. Brief: platform roles in Seoul hybrid. status=stopped; get_external_recommendation=false; internal recommendations allowed; profile visibility open_to_matches. Matching list revision list-1. Last candidate-visible contact yesterday: Dune interview preparation pack delivered and candidate said sufficient. No closure or Cedar recommendation has been communicated. No agent schedules. No general discovery delegated. No introduction or new sharing authorization.";
    const invocation: any = {
      id: "90000000-0000-4000-8000-000000000001",
      talent_id: "90000000-0000-4000-8000-000000000002",
      created_at: fixtures.requestTime,
      trigger: scenario.trigger,
      trigger_payload: {
        sourceEvents: scenario.sources,
        instruction: "Handle these sources in the current candidate context.",
      },
    };
    const runtime = new CareerCapabilityRuntime({
      mode: "progressive",
      replyId: `daily-eval:${scenario.id}`,
      eligibleTools: resolveCareerChatTools({
        channel: "chat",
        isOnboardingDone: true,
        background: true,
        hasActiveGmailIntegration: false,
        responseLocale: "ko",
      }).tools,
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
        structuredProfileText: scenario.profile ?? "윤서, 서울 플랫폼 엔지니어 6년",
        talentContextSection: facts,
        runtimeInstruction: [renderCareerBackgroundInvocation(invocation),
          scenario.companyIntroContext ? formatCompanyIntroContext(scenario.companyIntroContext) : ""].filter(Boolean).join("\n\n"),
        requestTime: new Date(fixtures.requestTime),
        timeZone: "Asia/Seoul",
        currentPreferences: {
          preferredLocale: "ko",
          getExternalRecommendation: scenario.externalEnabled ?? false,
          profileVisibility: "open_to_matches",
          talentSettingStatus: scenario.externalEnabled ? "active" : "stopped",
        },
      }),
    });
    const executeTool = async ({
      name,
      input,
    }: {
      name: string;
      input: any;
    }) => {
      trace.executions.push({ name, input });
      if (["contact_user", "deliver_career_email"].includes(name)) {
        const covered =
          input.action === "read"
            ? []
            : careerContactSourceIds(invocation, input.sourceIds);
        return {
          status: "sent",
          modelOutput: `Email delivery confirmed and saved in Career history. Delivery receipt fixture-receipt-1. Communicated pending source IDs: ${covered.join(", ")}.`,
        };
      }
      if (scenario.toolFacts && name in scenario.toolFacts)
        return { modelOutput: scenario.toolFacts[name] };
      if (scenario.facts && ["list_schedules", "read_schedule", "read_talent_context", "read_profile", "list_profiles", "read_talent_activity_events", "read_talent_schedules"].includes(name))
        return { modelOutput: facts };
      if (scenario.facts && name === "upsert_schedule")
        return { modelOutput: "Future reservation updated in the isolated fixture; no email sent." };
      if (scenario.facts) {
        if (name === "suggest_form") return { modelOutput: "Form saved in the isolated fixture. Form ID fixture-form-1; review URL https://matchharper.com/career?formId=fixture-form-1. This has not sent an email or shared anything with a company." };
        if (["write_talent_context", "upsert_matching"].includes(name)) {
          return { modelOutput: "Saved in the isolated fixture. No search, recommendation or delivery has completed. Current profile and search purpose remain as supplied." };
        }
        if (["read_matching", "list_matchings", "get_role_context", "read_agent_messages", "read_company_connections"].includes(name))
          return { modelOutput: "No saved opportunities, evaluations, company connections, selections or process changes in this fixture." };
        if (name === "manage_action_items") return { modelOutput: "No pending action items; requested fixture-only write recorded." };
        if (name === "manage_work") return { modelOutput: "This is the original background invocation; no delegated work is pending." };
        throw Error(`Synthetic pre-onboarding fixture does not implement ${name}`);
      }
      if (name === "manage_action_items")
        return {
          modelOutput:
            input.operation === "list"
              ? "No visible action items."
              : "Action item saved in the isolated fixture.",
        };
      if (name === "read_talent_activity_events")
        return {
          modelOutput:
            "Only current recorded events: Aster company rejection and Birch Role ended. Neither closure was communicated. No source changes or later candidate decisions.",
        };
      if (name === "read_company_connections")
        return {
          modelOutput:
            "Existing Cedar introduction only; Aster and Birch have no agent correspondence. No other connections.",
        };
      if (name === "manage_work")
        return {
          modelOutput:
            "This invocation is an original background source run, not a delegated work item. Its completion is owned by the original agent turn.",
        };
      if (name === "read_agent_messages" && scenario.id === "combined_updates")
        return {
          modelOutput:
            "No agent correspondence or candidate-visible email for Aster or Birch. Their closure notifications remain due.",
        };
      if (name === "read_agent_messages")
        return {
          modelOutput:
            "Company message company-message, introduction existing-introduction, Cedar: Please ask 윤서 whether they are interested in resuming our conversation. No change to pipeline was made. Candidate has not answered. Prior consent allowed this company relationship; no consent to reopen.",
        };
      if (
        [
          "get_role_context",
          "read_recommended_opportunities",
          "list_matchings",
          "read_matching",
        ].includes(name)
      )
        return {
          modelOutput:
            "Current list revision list-1. Aster Role 30000000-0000-4000-8000-000000000001: company rejected pending connection, candidate closure notice allowed, no shareable reason. Birch Role 30000000-0000-4000-8000-000000000002: ended, accepted process, no offer. Cedar Role 30000000-0000-4000-8000-000000000003: active internal Platform Engineer, Seoul hybrid, Kubernetes deployment automation, 5+ years. Selected by company-side talent-first. Public posting https://example.test/jobs/cedar. No existing recommendation or introduction. Candidate preparation for Dune interview today 15:00 is already delivered.",
        };
      if (name === "upsert_opportunities")
        return {
          modelOutput:
            "Cedar saved in the default candidate list; recommendation 20000000-0000-4000-8000-000000000003; list revision list-2. No profile sharing or introduction. Career link https://www.matchharper.com/career",
        };
      if (
        [
          "list_schedules",
          "read_talent_schedules",
          "read_talent_context",
          "read_profile",
          "list_profiles",
        ].includes(name)
      )
        return { modelOutput: facts };
      throw Error(`Synthetic fixture does not implement ${name}`);
    };
    try {
      const step = runtime.resolveStep(false);
      trace.reply = await runCareerChatAssistant({
        primaryModel: currentModel,
        openAIResponsesReasoningEffort: "high",
        responseLocale: "ko",
        messages: [],
        tools: step.tools,
        systemBlocks: step.systemBlocks,
        toolRuntime: runtime,
        executeTool,
        abortSignal: AbortSignal.timeout(300000),
        usageLabel: `eval/career-daily-processing/${scenario.id}`,
      });
      trace.status = "completed";
    } catch (error) {
      trace.status = "failed";
      trace.error = String(error);
    }
    save(scenario.id, trace);
    process.stdout.write(`${scenario.id}: ${trace.status}\n`);
  }
  globalThis.fetch = originalFetch;
  process.stdout.write(`${directory}\n`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
