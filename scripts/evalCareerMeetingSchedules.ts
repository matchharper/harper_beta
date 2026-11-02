import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import Module from "node:module";
config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
const task = "docs/evaluation/career-meeting-schedules";
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const version = process.argv.includes("--v3") ? "v3" : process.argv.includes("--v2") ? "v2" : "v1";
const selectedCase = process.argv
  .find((value) => value.startsWith("--case="))
  ?.slice(7);
const frozen = JSON.parse(
  readFileSync(`${task}/manifest-${version}.json`, "utf8")
);
for (const [file, digest] of Object.entries(frozen.hashes))
  assert.equal(hash(readFileSync(`${task}/${file}`)), digest);
const cases = JSON.parse(readFileSync(`${task}/cases-${version}.json`, "utf8"));
if (selectedCase)
  assert.ok(cases.cases.some((item: { id: string }) => item.id === selectedCase), "Unknown evaluation case");
const gold = JSON.parse(readFileSync(`${task}/gold-${version}.json`, "utf8"));
const directory = `${task}/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(directory, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) =>
  writeFileSync(`${directory}/${name}.json`, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
async function main() {
  const modules = Module as unknown as { _load: (...args: any[]) => any },
    load = modules._load;
  modules._load = function (request: string, ...args: any[]) {
    return request === "server-only" ? {} : load.call(this, request, ...args);
  };
  const originalFetch = globalThis.fetch;
  let trace: any;
  globalThis.fetch = async (url, init) => {
    if (
      !["api.openai.com", "api.anthropic.com"].includes(
        new URL(String(url)).hostname
      )
    )
      throw new Error("Evaluation network boundary: model providers only");
    trace.requests.push(init?.body ? JSON.parse(String(init.body)) : null);
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
  try {
    const { setupMeetings, meetingAdmin, owner, role } =
      await import("../src/lib/career/meetings/testSupport");
    const { TALENT_MEETING_TOOLS } =
      await import("../src/lib/career/meetings/tools");
    const { readTalentSchedules, readUpcomingTalentScheduleContext } =
      await import("../src/lib/career/meetings/server");
    const { CAREER_SCHEDULE_TOOLS } =
      await import("../src/lib/career/schedules/tools");
    const { writeCareerSchedule, readCareerScheduleFollowIndex } =
      await import("../src/lib/career/schedules/server");
    const { formatGmailSearchResult } =
      await import("../src/lib/integrations/gmail");
    const { prepareCareerInboxContext } =
      await import("../src/lib/career/background/inbox");
    const { CareerCapabilityRuntime } =
      await import("../src/lib/career/capabilities/runtime");
    const { resolveCareerChatTools } =
      await import("../src/lib/career/llmTools");
    const { resolveCareerTextChatModel } =
      await import("../src/lib/career/textChatModelConfig");
    const { runCareerChatAssistant } = await import("../src/lib/career/llm");
    const { renderCareerBackgroundInvocation } =
      await import("../src/lib/career/background/prompt");
    const { formatCareerEmailReceipt } =
      await import("../src/lib/career/background/delivery");
    const { formatLlmDateTime } = await import("../src/lib/llm/promptDateTime");
    const model = resolveCareerTextChatModel(undefined);
    const files = [
      "scripts/evalCareerMeetingSchedules.ts",
      "src/lib/career/meetings/server.ts",
      "src/lib/career/meetings/tools.ts",
      "src/lib/career/background/inbox.ts",
      "src/lib/career/handbooks/proactiveCareer.ts",
      "src/lib/career/prompts/mainPrompt2.ts",
      "src/lib/career/capabilities/registry.ts",
    ];
    const manifest: any = {
      version,
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      dirty: true,
      model,
      hashes: Object.fromEntries(
        files.map((file) => [file, hash(readFileSync(file))])
      ),
      fixtureHashes: frozen.hashes,
      selectedCase: selectedCase ?? null,
      cases: [],
    };
    save("manifest", manifest);
    const sessions = new Map<string, { db: Awaited<ReturnType<typeof setupMeetings>>; history: any[] }>();
    const selectedScenarios = cases.cases.filter(
      (item: any) => !selectedCase || item.id === selectedCase
    );
    if (selectedCase && selectedScenarios[0]?.continuity)
      throw new Error("Continuity cases must run together; omit --case.");
    for (const scenario of selectedScenarios) {
      const sessionKey = scenario.continuity ?? scenario.id;
      if (!sessions.has(sessionKey)) sessions.set(sessionKey, { db: await setupMeetings(), history: [] });
      const session = sessions.get(sessionKey)!;
      const db = session.db, admin = meetingAdmin(db);
      const now = scenario.now ?? cases.now;
      trace = {
        scenario,
        requests: [],
        responses: [],
        executions: [],
        emails: [],
      };
      try {
        const context: any = {
          admin,
          userId: owner,
          resumeRequestId: `eval:${scenario.id}`,
        };
        let existingId: string | undefined = (await db.query<any>("select id from meeting_schedules order by id limit 1")).rows[0]?.id;
        if (scenario.existing) {
          const saved: any = await TALENT_MEETING_TOOLS.upsert_talent_schedules
            .execute!(
            {
              action: "create",
              title: "Atlas platform interview",
              role_id: role,
              starts_at: scenario.existingStart ?? "2030-01-07T09:00:00+09:00",
              ends_at: scenario.existingEnd ?? "2030-01-07T10:00:00+09:00",
              timezone: "Asia/Seoul",
              content:
                "Prepare a deployment example. https://meet.example.test/platform",
              source_key: "gmail:atlas-thread:interview",
              source_refs: {
                gmailThreadIds: ["atlas-thread"],
                gmailMessageIds: ["original-invite"],
              },
            },
            context
          );
          existingId = saved.schedule.id;
          await writeCareerSchedule({
            admin,
            userId: owner,
            requestId: "prior-reminder",
            input: {
              action: "create",
              title: "Interview preparation",
              instruction:
                "Read the linked appointment and send useful preparation before the interview.",
              next_run_at: "2030-01-06T09:00:00+09:00",
              target_refs: { meetingScheduleIds: [existingId] },
            },
          });
        }
        const appointmentContext = await readUpcomingTalentScheduleContext({
          admin,
          userId: owner,
          now: new Date(now),
        });
        let workContext = await readCareerScheduleFollowIndex({
          admin,
          userId: owner,
        });
        const email = {
          messageId: `email-${scenario.id}`,
          threadId: "atlas-thread",
          from: "recruiter@atlas.example.test",
          to: "candidate@example.test",
          cc: null,
          subject: scenario.subject,
          receivedAt: now,
          snippet: scenario.body.slice(0, 95),
        };
        const sourceEmails = scenario.emails ?? [{ ...email, content: scenario.body }];
        const emailResult = (full: boolean, input: Record<string, unknown> = {}) => ({
          status: "ok" as const,
          emails:
            !full && scenario.discoveryEmpty
              ? []
              : sourceEmails.filter((item: any) => !input.thread_id || item.threadId === input.thread_id)
                .map((item: any) => full ? item : { ...item, content: undefined, snippet: item.snippet ?? item.content.slice(0, 95) }),
          truncated: false,
          nextPageToken: null,
          assistantInstruction: "Only returned source messages were retrieved.",
        });
        const sourceWork = scenario.sourceFromWork
          ? (await db.query<any>("select * from talent_agent_schedules where status='active' and next_run_at <= $1 order by next_run_at,id", [now])).rows
          : [];
        if (scenario.sourceFromWork) assert.ok(sourceWork.length, "A prior model turn must reserve work that is due");
        const run = {
          id: crypto.randomUUID(),
          talent_id: owner,
          conversation_id: null,
          status: "handed_off",
          trigger: "career_schedule_due",
          created_at: now,
          trigger_payload: {
            runContract: "career_agent_v1",
            sourceEvents: sourceWork.length ? sourceWork.map((work: any) => ({ sourceKind: "schedule", sourceId: work.id,
              revision: work.directive_revision, scheduleRevision: work.revision, occurredAt: work.next_run_at,
              title: work.title, instruction: work.instruction, targetRefs: work.target_refs })) : existingId
              ? [{ targetRefs: { meetingScheduleIds: [existingId] } }]
              : [],
            instruction:
              "Continue the user’s delegated interview support. Review current inbox evidence and appointments; maintain accurate records and useful preparation/reminder work.",
          },
        };
        await db.query("insert into opportunity_discovery_run(id,talent_id,status,trigger,created_at,trigger_payload) values($1,$2,$3,$4,$5,$6)",
          [run.id, owner, run.status, run.trigger, now, JSON.stringify(run.trigger_payload)]);
        for (const work of sourceWork)
          await db.query("update talent_agent_schedules set status='triggered',last_run_id=$2,next_run_at=null where id=$1", [work.id,run.id]);
        if (sourceWork.length) workContext = await readCareerScheduleFollowIndex({ admin, userId: owner });
        trace.sourceWork = sourceWork;
        const inbox = await prepareCareerInboxContext(
          { admin, userId: owner, run, now: new Date(now) },
          {
            readSchedules: readTalentSchedules,
            search: async (args) => {
              trace.executions.push({
                name: "automatic_gmail_read",
                input: { query: args.query, threadId: args.threadId },
              });
              if (scenario.gmailUnavailable) throw new Error("Synthetic Gmail OAuth connection is unavailable");
              return emailResult(Boolean(args.threadId), { thread_id: args.threadId });
            },
          }
        );
        const background = renderCareerBackgroundInvocation(run);
        context.backgroundInvocation = {
          runId: run.id,
          sourceMessageCursor: 0,
          meetingScheduleVersions: inbox.meetingScheduleVersions,
        };
        const runtime = new CareerCapabilityRuntime({
          mode: "progressive",
          replyId: `eval:${scenario.id}`,
          eligibleTools: resolveCareerChatTools({
            channel: "chat",
            isOnboardingDone: true,
            background: true,
            hasActiveGmailIntegration: true,
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
            structuredProfileText: "윤서, 플랫폼 엔지니어.",
            requestTime: new Date(now),
            timeZone: "Asia/Seoul",
            talentContextSection: scenario.context ?? `User delegation: 면접 메일을 확인해서 일정 기록하고 준비할 것과 리마인드를 알아서 챙겨줘. Atlas platform engineer Role ${role} is the existing application. No other active application. Next routine Career check is January 13.`,
            runtimeInstruction: [
              background,
              appointmentContext,
              workContext,
              inbox.text,
              session.history.length ? `Recent candidate-visible email history:\n${session.history.slice(-5).map(item => `Sent ${formatLlmDateTime(item.at)} Asia/Seoul\nSubject: ${item.subject}\n${item.body}`).join("\n\n")}` : "No recent outbound email in this window.",
            ].join("\n\n"),
            currentPreferences: {
              preferredLocale: "ko",
              talentSettingStatus: "active",
              profileVisibility: "open_to_matches",
            },
          }),
        });
        let emailReceipt: any = null;
        const executeTool = async ({
          name,
          input,
        }: {
          name: string;
          input: Record<string, unknown>;
        }) => {
          let result: any;
          context.toolCallId = `call:${trace.executions.length}`;
          if (TALENT_MEETING_TOOLS[name])
            result = await TALENT_MEETING_TOOLS[name].execute!(input, context);
          else if (CAREER_SCHEDULE_TOOLS[name])
            result = await CAREER_SCHEDULE_TOOLS[name].execute!(input, context);
          else if (name === "search_connected_gmail") {
            if (scenario.gmailUnavailable) throw new Error("Synthetic Gmail OAuth connection is unavailable");
            result = {
              ...emailResult(true, input),
              modelOutput: formatGmailSearchResult(emailResult(true, input)),
            };
          }
          else if (name === "deliver_career_email") {
            if ((input.action ?? "deliver") === "deliver") {
              trace.emails.push(input);
              emailReceipt = {
                id: `candidate-email-${scenario.id}`,
                status: "sent",
                sent_at: now,
                payload: {
                  resendEmailId: `provider-${scenario.id}`,
                  emailPayload: { subject: input.subject },
                  bodyMarkdown: input.body,
                },
              };
            }
            result = {
              status: emailReceipt?.status ?? "not_prepared",
              modelOutput: formatCareerEmailReceipt(emailReceipt),
            };
          } else if (
            name === "get_role_context" ||
            name === "read_recommended_opportunities"
          )
            result = {
              modelOutput: scenario.context ?? `Role ${role}: Atlas platform engineer; user applied and is interviewing. No additional change.`,
            };
          else if (name === "read_talent_context")
            result = {
              modelOutput:
                "User wants interview support. No additional requirements or contact restrictions.",
            };
          else if (name === "read_talent_activity_events")
            result = {
              modelOutput:
                session.history.length ? session.history.map(item => `Sent ${formatLlmDateTime(item.at)}: ${item.subject}\n${item.body}`).join("\n\n") : "No prior relevant contact or reminder events in this synthetic user's history.",
            };
          else if (name === "read_profile")
            result = {
              modelOutput:
                "No saved profile versions. The confirmed profile facts are: 윤서, 플랫폼 엔지니어. No deployment project details have been provided.",
            };
          else throw new Error(`Unsupported synthetic tool: ${name}`);
          trace.executions.push({ name, input, result });
          return result;
        };
        const step = runtime.resolveStep(false);
        trace.reply = await runCareerChatAssistant({
          primaryModel: model.model,
          openAIResponsesReasoningEffort: model.openAIResponsesReasoningEffort,
          chatCompletionReasoningEffort: model.chatCompletionReasoningEffort,
          responseLocale: "ko",
          messages: [],
          toolRuntime: runtime,
          tools: step.tools,
          systemBlocks: step.systemBlocks,
          executeTool,
          abortSignal: AbortSignal.timeout(240000),
          usageLabel: `eval/career-meeting-schedules/${scenario.id}`,
        });
        for (const sent of trace.emails) session.history.push({ ...sent, at: now });
        await db.query("update opportunity_discovery_run set status='completed',completed_at=$2 where id=$1", [run.id,now]);
        if (sourceWork.length) await db.query("select finish_career_source_events($1)", [run.id]);
        trace.appointments = (
          await db.query<any>("select * from meeting_schedules")
        ).rows;
        trace.work = (
          await db.query<any>("select * from talent_agent_schedules")
        ).rows;
        assert.ok(trace.emails.length >= (gold[scenario.id].minEmails ?? 0), "Expected candidate-visible email was not prepared");
        assert.equal(
          trace.appointments.length,
          gold[scenario.id].appointmentCount ?? 1
        );
        if (gold[scenario.id].appointmentCount === 0) {
          trace.passed = true;
          continue;
        }
        const row = trace.appointments[0];
        if (existingId) assert.equal(row.id, existingId);
        assert.equal(row.status, gold[scenario.id].status);
        if (gold[scenario.id].startsAt)
          assert.equal(
            new Date(row.confirmed_start_at).toISOString(),
            gold[scenario.id].startsAt
          );
        assert.equal(row.role_id, gold[scenario.id].unlinked ? null : role);
        if (gold[scenario.id].unknownEnd) assert.equal(row.confirmed_end_at, null);
        if (gold[scenario.id].version) assert.equal(Number(row.version), gold[scenario.id].version);
        assert.equal(
          (await db.query("select * from meeting_test_effects")).rows.length,
          0
        );
        if (gold[scenario.id].status === "cancelled")
          assert.equal(
            trace.work.filter(
              (w: any) =>
                w.status === "active" &&
                w.target_refs.meetingScheduleIds?.includes(row.id)
            ).length,
            0
          );
        else if (gold[scenario.id].requireFutureWork !== false)
          assert.ok(
            trace.work.some(
              (w: any) =>
                w.status === "active" &&
                w.target_refs.meetingScheduleIds?.includes(row.id)
            )
          );
        trace.passed = true;
      } catch (error) {
        trace.error = String(error);
        trace.passed = false;
        process.exitCode = 1;
      } finally {
        save(scenario.id, trace);
        manifest.cases.push({
          id: scenario.id,
          passed: trace.passed,
          error: trace.error,
        });
        save("manifest", manifest);
        console.log(scenario.id, trace.passed ? "passed" : trace.error);
      }
    }
    for (const {db} of sessions.values()) await db.close();
    console.log(directory);
  } finally {
    globalThis.fetch = originalFetch;
    modules._load = load;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
