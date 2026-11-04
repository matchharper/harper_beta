import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CAREER_ACTION_ITEM_TOOLS } from "@/lib/career/actionItemsTool";
import { readCareerActionItemRow } from "@/lib/career/actionItems.server";
import { CareerCapabilityRuntime } from "@/lib/career/capabilities/runtime";
import { resolveCareerChatTools } from "@/lib/career/llmTools";
import { runCareerChatAssistant, CAREER_LLM_CONFIG } from "@/lib/career/llm";
import { buildCareerSessionStartTurnInstruction } from "@/lib/career/prompts";
import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";
import { withLlmProviderTrace } from "@/lib/llm/providerTrace";
import { formatWork, workContext } from "@/lib/career/work/store";
import { formatCareerFormForModel } from "@/lib/career/forms/format";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import { REENGAGEMENT_OPPORTUNITY_PRELOAD } from "@/lib/career/reengagementOpportunities";

const root = "docs/evaluation/career-visible-actions";
const version =
  process.argv.find((arg) => /^--version=v[0-9]+$/.test(arg))?.split("=")[1] ??
  "v1";
const bytes = readFileSync(`${root}/cases-${version}.json`);
const dataset = JSON.parse(bytes.toString());
const selectedCaseId = process.argv
  .find((arg) => arg.startsWith("--case="))
  ?.slice(7);
const cases = selectedCaseId
  ? dataset.cases.filter(
      (fixture: { id: string }) => fixture.id === selectedCaseId
    )
  : dataset.cases;
if (!cases.length)
  throw new Error(`Unknown evaluation case: ${selectedCaseId}`);
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const runId = new Date().toISOString().replaceAll(":", "-");
const output = `${root}/runs/${runId}`;
mkdirSync(output, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
const files = [
  "src/lib/career/actionItems.ts",
  "src/lib/career/actionItemsTool.ts",
  "src/lib/career/prompts/conversationPlan.ts",
  "src/lib/career/prompts/cases/lifecyclePrompts.ts",
  "src/lib/career/prompts/mainPrompt2.ts",
  "src/lib/career/capabilities/runtime.ts",
  "src/lib/career/work/store.ts",
  "src/lib/career/work/tools.ts",
  "src/lib/career/forms/server.ts",
  "src/lib/career/forms/format.ts",
  "src/lib/career/reengagementOpportunities.ts",
  "src/lib/career/llm.ts",
  "scripts/evalCareerVisibleActions.ts",
];
save("manifest", {
  task: "career-visible-actions",
  datasetVersion: dataset.datasetVersion,
  caseIds: cases.map((fixture: { id: string }) => fixture.id),
  runId,
  fixtureHash: hash(bytes),
  goldHash: hash(readFileSync(`${root}/gold-${version}.json`)),
  generalTools: Boolean(dataset.generalTools),
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirtyDiffHash: hash(execFileSync("git", ["diff", "HEAD", "--", ...files])),
  sources: Object.fromEntries(
    files.map((file) => [
      file,
      { hash: hash(readFileSync(file)), text: readFileSync(file, "utf8") },
    ])
  ),
  model: CAREER_LLM_CONFIG.assistant.primaryModel,
  returnModel: CLAUDE_HAIKU_MODEL,
  temperature: 0.8,
  timeoutMs: 180000,
  humanReview: "pending",
  boundary:
    "Synthetic data, memory storage, provider-only network. No external execution.",
});

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    if (
      !["https://api.openai.com", "https://api.anthropic.com"].includes(
        url.origin
      )
    )
      throw new Error(`Blocked evaluation network: ${url.origin}`);
    return originalFetch(input, init);
  };
  try {
    for (const fixture of cases) {
      const works = structuredClone(fixture.works ?? []);
      const forms = structuredClone(fixture.forms ?? []);
      const generalEffects: unknown[] = [];
      const rows: any[] = fixture.items.map((item: any) => ({
        ...item,
        button_text: item.buttonText,
      }));
      const currentItems = () =>
        rows.filter((row) => !row.deleted_at).map(readCareerActionItemRow);
      let listLoaded = !fixture.initialListUnavailable;
      const calls: unknown[] = [],
        exchanges: unknown[] = [],
        progress: string[] = [];
      const admin = {
        from: (table: string) => {
          if (table !== "career_action_items") {
            let records =
              table === "talent_external_operations"
                ? [...works]
                : table === "talent_messages"
                  ? fixture.messages
                      .filter((message: any) => message.role === "user")
                      .map((message: any, index: number) => ({
                        ...message,
                        id: message.id ?? 501 + index,
                        user_id: "00000000-0000-4000-8000-000000000001",
                        conversation_id: "00000000-0000-4000-8000-000000000003",
                        message_type: message.message_type ?? "chat",
                        payload: message.payload ?? {},
                      }))
                  : [];
            const query = {
              select: () => query,
              order: () => query,
              limit: () => query,
              eq: (key: string, value: unknown) => {
                records = records.filter((row: any) => row[key] === value);
                return query;
              },
              neq: (key: string, value: unknown) => {
                records = records.filter((row: any) => row[key] !== value);
                return query;
              },
              in: (key: string, values: unknown[]) => {
                records = records.filter((row: any) =>
                  values.includes(row[key])
                );
                return query;
              },
              maybeSingle: async () => ({
                data: records[0] ?? null,
                error: null,
              }),
              then: (resolve: (value: unknown) => void) =>
                Promise.resolve({ data: records, error: null }).then(resolve),
            };
            return query;
          }
          let records = rows.filter((row) => !row.deleted_at);
          const query = {
            select: () => query,
            eq: (key: string, value: unknown) => {
              if (key !== "user_id")
                records = records.filter((row) => row[key] === value);
              return query;
            },
            is: () => query,
            maybeSingle: async () => ({
              data: records[0] ?? null,
              error: null,
            }),
            then: (resolve: (value: unknown) => void) =>
              Promise.resolve({
                data: records,
                error: null,
              }).then(resolve),
          };
          return query;
        },
        rpc: async (name: string, input: any) => {
          if (name !== "manage_career_action_item")
            throw new Error(`Unsupported fixture RPC: ${name}`);
          let row = rows.find(
              (row) => row.id === input.p_id && !row.deleted_at
            ),
            status: string;
          if (input.p_operation === "create") {
            const previous = rows.find(
              (row) => row.creation_key === input.p_creation_key
            );
            if (previous)
              return {
                error: null,
                data: {
                  status: previous.deleted_at
                    ? "already_deleted"
                    : "already_created",
                  id: previous.id,
                  item: previous,
                },
              };
            row = {
              id: crypto.randomUUID(),
              revision: 1,
              ...input.p_item,
              button_text: input.p_item.buttonText,
              creation_key: input.p_creation_key,
            };
            rows.push(row);
            status = "created";
          } else if (!row) status = "not_found";
          else if (row.revision !== input.p_expected_revision)
            status = "conflict";
          else if (input.p_operation === "delete") {
            row.deleted_at = "deleted";
            row.revision++;
            status = "deleted";
          } else {
            Object.assign(row, input.p_item, {
              button_text: input.p_item.buttonText,
              revision: row.revision + 1,
            });
            status = "updated";
          }
          return {
            error: null,
            data: { status, id: row?.id ?? input.p_id, item: row },
          };
        },
      };
      const eligibleTools = resolveCareerChatTools({
        isOnboardingDone: true,
        background: fixture.mode === "background",
      }).tools;
      const tools = dataset.generalTools
        ? eligibleTools
        : eligibleTools.filter(
            (tool) => tool.function.name === "manage_action_items"
          );
      const delegatedContext = fixture.workId
        ? await workContext(
            {
              admin: admin as any,
              userId: "00000000-0000-4000-8000-000000000001",
              conversationId: "00000000-0000-4000-8000-000000000003",
            },
            fixture.workId
          )
        : "";
      const initialResources = [
        delegatedContext || works.map(formatWork).join("\n\n"),
        forms.length
          ? "Unresolved forms (use suggest_form read for exact contents and responses; resolve when no further input is needed):\n" +
            forms
              .map(
                (form: any) =>
                  `- formId ${form.formId}, revision ${form.revision}: ${form.title}`
              )
              .join("\n")
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const runtime = new CareerCapabilityRuntime({
        mode: "progressive",
        eligibleTools: tools,
        allowLoaders: Boolean(dataset.generalTools),
        ...(dataset.generalTools && fixture.mode === "return"
          ? { selection: REENGAGEMENT_OPPORTUNITY_PRELOAD }
          : {}),
        promptArgs: () => ({
          channel: "chat",
          isOnboardingDone: true,
          backgroundInvocation: fixture.mode === "background",
          isMobile: fixture.isMobile,
          actionItems: listLoaded ? currentItems() : null,
          profile: null,
          structuredProfileText:
            "사용자는 한국어로 대화한다. 구직 상황과 지원 의사는 아래 사용자 원문에 따른다.",
          talentContextSection: "",
          careerCoachingActivity: null,
          currentPreferences: { preferredLocale: "ko" },
          requestTime: new Date("2026-11-04T13:00:00Z"),
          timeZone: "Asia/Seoul",
          runtimeInstruction: [fixture.facts, initialResources]
            .filter(Boolean)
            .join("\n\n"),
        }),
      });
      const step = runtime.resolveStep(false);
      const messages = fixture.messages.map((message: any) => ({
        role: message.role,
        content: message.payload
          ? formatTalentMessageContentForLlmPrompt(message, {
              includeCreatedAt: false,
              preferredLocale: "ko",
              timeZone: "Asia/Seoul",
            })
          : message.content,
      }));
      if (fixture.mode === "return")
        messages.push({
          role: "user",
          content: `[Application event; not a user message or consent]\n${buildCareerSessionStartTurnInstruction(
            {
              currentAccessAt: "2026-11-04T13:00:00Z",
              previousChatAt: "2026-11-01T09:00:00Z",
              idleMs: 273600000,
              isOnboardingDone: true,
              preferredLocale: "ko",
              timeZone: "Asia/Seoul",
            }
          )}`,
        });
      if (fixture.mode === "background")
        messages.push({
          role: "user",
          content:
            "[Application event; not a new user request]\nThe delegated work has reached the verified waiting state described in context. Continue the original authorized purpose using the current facts.",
        });
      const started = Date.now();
      try {
        const result = await withLlmProviderTrace(
          (exchange) => {
            exchanges.push(exchange);
          },
          () =>
            runCareerChatAssistant({
              systemBlocks: step.systemBlocks,
              tools: step.tools,
              toolRuntime: runtime,
              messages,
              primaryModel:
                fixture.mode === "return"
                  ? CLAUDE_HAIKU_MODEL
                  : CAREER_LLM_CONFIG.assistant.primaryModel,
              usageLabel:
                fixture.mode === "return"
                  ? "career/chat:session_reengagement"
                  : "career/chat:assistant",
              responseLocale: "ko",
              temperature: 0.8,
              abortSignal: AbortSignal.timeout(180_000),
              onAssistantMessage: async (text) => {
                progress.push(text);
              },
              executeTool: async ({ name, input }) => {
                if (dataset.generalTools && name !== "manage_action_items") {
                  let result: any;
                  if (name === "manage_work") {
                    const work = works.find(
                      (value: any) => value.id === input.work_id
                    );
                    if (input.action === "list")
                      result = {
                        works,
                        modelOutput:
                          works.map(formatWork).join("\n\n") ||
                          "End of work list.",
                      };
                    else if (!work) throw new Error("Fixture work unavailable");
                    else if (input.action === "read")
                      result = { work, modelOutput: formatWork(work) };
                    else {
                      if (input.expected_revision !== work.revision)
                        throw new Error("Fixture work revision conflict");
                      if (
                        ["wait", "finish"].includes(String(input.action)) &&
                        fixture.workId !== work.id
                      )
                        throw new Error(
                          "Only this work invocation may wait/finish"
                        );
                      work.revision++;
                      work.status =
                        input.action === "wait"
                          ? "waiting_user"
                          : input.action === "finish"
                            ? "completed"
                            : input.action === "cancel"
                              ? "cancelled"
                              : "queued";
                      if (input.note) work.result.note = input.note;
                      if (input.refs) work.result.refs = input.refs;
                      if (input.instruction)
                        work.request.change = input.instruction;
                      generalEffects.push({ name, input });
                      result = { work, modelOutput: formatWork(work) };
                    }
                  } else if (name === "suggest_form") {
                    const form = forms.find(
                      (value: any) => value.formId === input.formId
                    );
                    if (input.action === "list")
                      result = {
                        modelOutput:
                          forms.map(formatCareerFormForModel).join("\n\n") ||
                          "No forms.",
                      };
                    else if (!form) throw new Error("Fixture form unavailable");
                    else if (input.action === "resolve") {
                      if (input.revision !== form.revision)
                        throw new Error("Fixture form revision conflict");
                      form.resolved = true;
                      generalEffects.push({ name, input });
                      result = {
                        ok: true,
                        modelOutput: `Form ${form.formId} revision ${form.revision} no longer needs user input. This does not submit an application.`,
                      };
                    } else if (
                      ["read", "present"].includes(String(input.action))
                    ) {
                      if (input.action === "present")
                        generalEffects.push({ name, input });
                      result = {
                        form,
                        responses: [],
                        modelOutput: formatCareerFormForModel(form),
                      };
                    } else
                      throw new Error("Unconfigured fixture form mutation");
                  } else
                    throw new Error(
                      `Unconfigured fixture tool; no external effect executed: ${name}`
                    );
                  calls.push({ name, input, result: structuredClone(result) });
                  return result;
                }
                if (name !== "manage_action_items")
                  throw new Error(`Unsupported fixture tool: ${name}`);
                const result = await CAREER_ACTION_ITEM_TOOLS[name].execute!(
                  input,
                  {
                    admin: admin as any,
                    userId: "00000000-0000-4000-8000-000000000001",
                    conversationId: "00000000-0000-4000-8000-000000000003",
                    resumeRequestId: `fixture:${fixture.id}`,
                  }
                );
                calls.push({ name, input, result });
                listLoaded = true;
                return result;
              },
            })
        );
        save(fixture.id, {
          fixture,
          result,
          progress,
          calls,
          items: currentItems(),
          works,
          forms,
          generalEffects,
          exchanges,
          elapsedMs: Date.now() - started,
        });
        console.log(
          `${fixture.id}: ${calls.length} calls, ${currentItems().length} items, ${Date.now() - started} ms`
        );
      } catch (error) {
        save(fixture.id, {
          fixture,
          error: String(error),
          progress,
          calls,
          items: currentItems(),
          works,
          forms,
          generalEffects,
          exchanges,
        });
        throw error;
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(`Artifacts: ${output}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
