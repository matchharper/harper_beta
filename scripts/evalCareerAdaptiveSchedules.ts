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
const task = "docs/evaluation/career-adaptive-schedules";
const hash = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
const cases = JSON.parse(readFileSync(`${task}/cases-v1.json`, "utf8"));
const frozen = JSON.parse(readFileSync(`${task}/manifest-v1.json`, "utf8"));
for (const [file, digest] of Object.entries(frozen.hashes))
  assert.equal(hash(readFileSync(`${task}/${file}`)), digest);

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = `${task}/runs/${runId}`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) =>
    writeFileSync(`${directory}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  const network = new AsyncLocalStorage<{
    requests: unknown[];
    responses: unknown[];
  }>();
  const originalFetch = globalThis.fetch;
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const originalLoad = modules._load;
  // The Next server-only marker has no behavior in this isolated Node harness.
  modules._load = function (request: string, ...args: any[]) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, ...args);
  };
  globalThis.fetch = async (url, init) => {
    if (new URL(String(url)).hostname !== "api.openai.com")
      throw new Error(
        "Evaluation network boundary: only the model provider is allowed"
      );
    const scope = network.getStore();
    if (init?.body) scope?.requests.push(JSON.parse(String(init.body)));
    const response = await originalFetch(url, {
      ...init,
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(120_000),
      ]),
    });
    const copy = response.clone();
    scope?.responses.push(
      await copy.json().catch(() => ({ status: response.status }))
    );
    return response;
  };
  try {
    const { setup, localAdmin, owner } =
      await import("../src/lib/career/schedules/testSupport");
    const {
      collectDueCareerWork,
      readCareerCheckIn,
      readCareerScheduleFollowIndex,
      writeCareerSchedule,
    } = await import("../src/lib/career/schedules/server");
    const { CAREER_SCHEDULE_TOOLS } =
      await import("../src/lib/career/schedules/tools");
    const { CareerCapabilityRuntime } =
      await import("../src/lib/career/capabilities/runtime");
    const { resolveCareerChatTools } =
      await import("../src/lib/career/llmTools");
    const { resolveCareerTextChatModel } =
      await import("../src/lib/career/textChatModelConfig");
    const { runCareerChatAssistant } = await import("../src/lib/career/llm");
    const { renderCareerBackgroundInvocation } =
      await import("../src/lib/career/background/prompt");
    const { assertCareerSourceEventsCurrent } =
      await import("../src/lib/career/companies/server");
    const { withToolTrace } = await import("../src/lib/llm/toolTrace");
    const id = (n: number) =>
      `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const sources = [
      "scripts/evalCareerAdaptiveSchedules.ts",
      "src/lib/career/schedules/server.ts",
      "src/lib/career/schedules/tools.ts",
      "src/lib/career/prompts/mainPrompt2.ts",
      "src/lib/career/handbooks/proactiveCareer.ts",
      "src/lib/career/capabilities/registry.ts",
      "supabase/migrations/20261102064501_career_adaptive_check_in.sql",
    ];
    const manifest: any = {
      runId,
      datasetVersion: "v1",
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      dirty: true,
      sourceHashes: Object.fromEntries(
        sources.map((file) => [file, hash(readFileSync(file))])
      ),
      fixtureHashes: frozen.hashes,
      deadlineMs: 300_000,
      cases: [],
    };
    save("manifest", manifest);
    const run = async (scenario: any) => {
      const db = await setup(),
        admin = localAdmin(db);
      const trace: any = {
        requests: [],
        responses: [],
        tools: [],
        executions: [],
        scenario,
        startedAt: new Date().toISOString(),
      };
      try {
        await db.query(
          "update talent_setting set is_onboarding_done=true where user_id=$1",
          [owner]
        );
        const initial = (await readCareerCheckIn({ admin, userId: owner }))!;
        const before = await writeCareerSchedule({
          admin,
          userId: owner,
          actor: "career_agent",
          sourceMessageId: 19,
          requestId: "fixture",
          input: {
            action: scenario.status === "paused" ? "pause" : "update",
            schedule_id: initial.id,
            expected_revision: initial.revision,
            interval_days: scenario.interval,
            reason: scenario.reason,
          },
        });
        const background = scenario.mode === "background";
        const model = background
          ? {
              model: "gpt-6-luna",
              openAIResponsesReasoningEffort: "high" as const,
            }
          : resolveCareerTextChatModel(undefined);
        trace.model = model;
        let invocation: any;
        if (background) {
          await db.query(
            "update talent_agent_schedules set next_run_at='2020-01-01' where id=$1",
            [before.id]
          );
          const runId = (await collectDueCareerWork({ admin })).runIds[0];
          await db.query(
            "update opportunity_discovery_run set status='handed_off' where id=$1",
            [runId]
          );
          invocation = (
            await db.query<any>(
              "select * from opportunity_discovery_run where id=$1",
              [runId]
            )
          ).rows[0];
        }
        const context = await readCareerScheduleFollowIndex({
          admin,
          userId: owner,
        });
        const matching = {
          id: id(2),
          title: "서울 플랫폼 엔지니어",
          revision: 1,
          archived_at: null,
        };
        const facts = `Current Brief: platform engineer in Seoul; hybrid work; current profile has six years of Kubernetes and deployment automation experience.\nDefault profile ${id(3)} revision 1. Matching ${matching.id} revision 1.\n${background ? "No active application or pending company request." : `Atlas platform engineer role ${id(4)} is a current external posting. A previous user-approved resume document ${id(5)} and application session ${id(6)} are saved; no material changes since approval.`}\n${scenario.facts ?? "The user is discussing current Career work; no contact opt-out is saved in account settings."}`;
        const eligible = resolveCareerChatTools({
          channel: "chat",
          isOnboardingDone: true,
          background,
          hasActiveGmailIntegration: false,
          responseLocale: "ko",
        }).tools;
        const runtime = new CareerCapabilityRuntime({
          mode: "progressive",
          replyId: `eval:${scenario.id}`,
          eligibleTools: eligible,
          ...(background
            ? {
                preloads: ["schedules", "career_delivery"],
                selection: {
                  capabilityIds: [],
                  handbookIds: ["proactive_career"],
                  status: "selected",
                  elapsedMs: 0,
                },
              }
            : {}),
          promptArgs: () => ({
            channel: "chat",
            isOnboardingDone: true,
            backgroundInvocation: background,
            profile: null,
            structuredProfileText:
              "윤서, 서울의 6년차 플랫폼 엔지니어. Kubernetes 운영과 배포 자동화.",
            talentContextSection: facts,
            runtimeInstruction: [
              background ? renderCareerBackgroundInvocation(invocation) : "",
              context,
            ]
              .filter(Boolean)
              .join("\n\n"),
            requestTime: new Date(cases.requestTime),
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
          if (CAREER_SCHEDULE_TOOLS[name])
            return CAREER_SCHEDULE_TOOLS[name].execute!(input, {
              admin,
              userId: owner,
              userMessageId: background ? undefined : 20,
              ...(background
                ? {
                    backgroundInvocation: {
                      runId: invocation.id,
                      sourceMessageCursor: 0,
                    },
                  }
                : {}),
              toolCallId: `case:${scenario.id}:${trace.executions.length}`,
            } as any);
          if (name === "update_setting")
            throw new Error(
              "No request to change account contact permissions was made in this fixture."
            );
          if (name === "deliver_career_email")
            return {
              status: "sent",
              modelOutput:
                "Synthetic email receipt. No actual email was sent by this evaluation.",
            };
          if (
            ["list_matchings", "read_matching", "upsert_matching"].includes(
              name
            )
          )
            return {
              matching,
              modelOutput: `Matching ${matching.id}; revision 1; active. Current Brief: Seoul platform engineer, hybrid. Default profile ${id(3)} revision 1. Current list revision list-1.`,
            };
          if (name === "search_opportunities")
            return {
              runId: id(7),
              source: "external",
              status: "completed",
              modelOutput: background
                ? "Evaluation completed. No new suitable roles. Sources and Brief unchanged; no missing evidence or failed evaluation."
                : `Evaluation ${id(7)} completed. Atlas platform engineer role ${id(4)}: Kubernetes ownership, hybrid Seoul, salary fits the current Brief. Suitable for consideration; not yet published.`,
            };
          if (
            ["read_recommended_opportunities", "get_role_context"].includes(
              name
            )
          )
            return {
              modelOutput: background
                ? "No new useful roles or pending obligations."
                : `Role ${id(4)}: Atlas, platform engineer, Seoul hybrid; Kubernetes and deployment automation, relevant to the current Brief. Current list revision list-1.`,
            };
          if (name === "upsert_opportunities")
            return {
              modelOutput: `Role ${id(4)} was added to the recommendation list. Current list revision list-2.`,
            };
          if (
            [
              "read_profile",
              "list_profiles",
              "read_talent_context",
              "list_documents",
              "read_document",
            ].includes(name)
          )
            return { modelOutput: facts };
          if (name === "use_browser")
            return {
              modelOutput: `Application session ${id(6)} completed the previously authorized Atlas application with the approved document ${id(5)}. Synthetic submission receipt application-1 is confirmed.`,
            };
          if (name === "suggest_form")
            return {
              modelOutput:
                "Form saved for the current request; no external submission occurred.",
            };
          throw new Error(`Synthetic fixture does not implement ${name}`);
        };
        const step = runtime.resolveStep(false);
        trace.reply = await network.run(trace, () =>
          withToolTrace(
            async (event) => {
              trace.tools.push(event);
            },
            () =>
              runCareerChatAssistant({
                primaryModel: model.model,
                openAIResponsesReasoningEffort:
                  model.openAIResponsesReasoningEffort,
                responseLocale: "ko",
                messages: background
                  ? []
                  : [{ role: "user", content: scenario.message }],
                tools: step.tools,
                systemBlocks: step.systemBlocks,
                toolRuntime: runtime,
                executeTool,
                abortSignal: AbortSignal.timeout(300_000),
                usageLabel: `eval/career-adaptive-schedules/${scenario.id}`,
              })
          )
        );
        const after = (await readCareerCheckIn({ admin, userId: owner }))!;
        if (background)
          await assertCareerSourceEventsCurrent({ admin, run: invocation });
        trace.before = before;
        trace.after = after;
        assert.equal(after.id, before.id);
        assert.equal(
          (
            await db.query<any>(
              "select count(*)::int n from talent_agent_schedules where talent_id=$1",
              [owner]
            )
          ).rows[0].n,
          1
        );
        if (scenario.expect === "resume")
          assert.ok(
            after.status === "active" && after.next_run_at,
            "Returning work should resume the agent-paused check-in"
          );
        if (scenario.expect === "stay_paused")
          assert.equal(after.status, "paused");
        if (scenario.expect === "instruction")
          assert.notEqual(after.instruction, before.instruction);
        if (scenario.expect === "preserve") {
          assert.equal(after.interval_days, before.interval_days);
          assert.equal(after.status, before.status);
        }
        if (scenario.expect === "adapt") {
          assert.ok(
            trace.executions.some(
              (entry: any) => entry.name === "upsert_schedule"
            ),
            "Adaptation must be saved by the agent"
          );
          assert.ok(
            after.status !== "active" ||
              after.interval_days !== before.interval_days ||
              after.next_run_at !== before.next_run_at,
            "The stale routine should be reconsidered"
          );
          assert.ok(
            !trace.executions.some(
              (entry: any) => entry.name === "deliver_career_email"
            ),
            "No useful contact exists in this background fixture"
          );
        }
        assert.ok(
          !trace.executions.some(
            (entry: any) => entry.name === "update_setting"
          )
        );
        trace.passed = true;
      } catch (error) {
        trace.error = error instanceof Error ? error.stack : String(error);
        trace.passed = false;
      } finally {
        await db.close();
        save(scenario.id, trace);
      }
      const result = {
        id: scenario.id,
        passed: trace.passed,
        model: trace.model,
        schedule: trace.after && {
          status: trace.after.status,
          interval_days: trace.after.interval_days,
          recurrence: trace.after.recurrence,
        },
        error: trace.error,
      };
      manifest.cases.push(result);
      save("manifest", manifest);
      console.log(JSON.stringify(result));
      return trace.passed;
    };
    const only = process.argv.includes("--only")
      ? new Set(process.argv[process.argv.indexOf("--only") + 1].split(","))
      : null;
    const selected = cases.cases.filter(
      (item: any) => !only || only.has(item.id)
    );
    let passed = true;
    for (let i = 0; i < selected.length; i += 2) {
      const results = await Promise.all(selected.slice(i, i + 2).map(run));
      passed = passed && results.every(Boolean);
    }
    console.log(directory);
    if (!passed) process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
    modules._load = originalLoad;
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
