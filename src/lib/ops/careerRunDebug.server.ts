import { previewCareerBackgroundTurn } from "@/lib/career/chatTurn";
import { renderCareerBackgroundInvocation } from "@/lib/career/background/prompt";
import { prepareCareerInboxContext } from "@/lib/career/background/inbox";
import type { CareerBackgroundRun } from "@/lib/career/background/types";
import { renderReplyEmail } from "@/lib/email/runtime/format";
import { InternalApiError } from "@/lib/internalApi";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { summarizeLlmDebugCalls, type LlmDebugCall } from "@/lib/llm/debugUsage";
import { getScheduledCareerModelOptions, isScheduledCareerRun } from "@/lib/career/background/scheduledModel";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { withToolTrace } from "@/lib/llm/toolTrace";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import type { CareerRunContact, CareerRunStreamEvent } from "./careerRunDebug";
import { fetchTalentSetting } from "@/lib/talentOnboarding/server";
import type { CareerSchedule } from "@/lib/career/schedules/server";

const readTools = new Set([
  "list_schedules", "read_schedule", "read_talent_schedules", "read_talent_context",
  "read_talent_activity_events", "read_recommended_opportunities", "get_role_context",
  "list_matchings", "read_matching",
]);

function isReadTool(name: string, input: Record<string, unknown>) {
  return readTools.has(name) ||
    (name === "manage_action_items" && input.operation === "list") ||
    (name === "search_opportunities" && input.action === "read" && typeof input.runId === "string");
}

export async function runCareerRunDebug(
  userId: string,
  signal: AbortSignal,
  send: (event: CareerRunStreamEvent) => void
) {
  const started = Date.now();
  const admin = getTalentSupabaseAdmin({ readOnly: true });
  // Replay an actual scheduled occurrence with the candidate's current context.
  // This reads the existing event and never collects, claims or advances work.
  const [account, previous, setting] = await Promise.all([
    admin.from("talent_users").select("name").eq("user_id", userId).is("deleted_at", null).maybeSingle(),
    admin.from("opportunity_discovery_run")
      .select("id,talent_id,conversation_id,status,trigger,trigger_payload,created_at")
      .eq("talent_id", userId)
      .in("trigger", ["career_daily_due", "career_schedule_due"])
      .eq("trigger_payload->>runContract", "career_agent_v1")
      .in("status", ["handed_off", "completed"])
      .not("conversation_id", "is", null)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle(),
    fetchTalentSetting({ admin, userId }),
  ]);
  if (account.error || previous.error) throw account.error ?? previous.error;
  if (!account.data) throw new InternalApiError(404, "Career 계정을 찾을 수 없습니다.");

  // Prefer an active reservation if there is no occurrence currently running.
  // Its event is built in memory from the same fields the scheduler reads.
  let run = previous.data as CareerBackgroundRun | null;
  if (run?.status !== "handed_off") {
    const schedules = admin.from("talent_agent_schedules" as never)
      .select("*").eq("talent_id", userId).eq("status", "active")
      .not("next_run_at", "is", null);
    if (setting?.status === "stopped" || setting?.get_external_recommendation === false)
      schedules.or("schedule_key.is.null,schedule_key.neq.career_check_in");
    const next = await schedules.order("next_run_at").limit(1).maybeSingle();
    if (next.error) throw next.error;
    const schedule = next.data as CareerSchedule | null;
    if (schedule) {
      const event = {
        sourceKind: "schedule", sourceId: schedule.id, revision: schedule.directive_revision,
        scheduleRevision: schedule.revision, occurredAt: schedule.next_run_at,
        title: schedule.title, instruction: schedule.instruction, targetRefs: schedule.target_refs,
        timezone: schedule.timezone, recurrence: schedule.recurrence, intervalDays: schedule.interval_days,
        scheduleKey: schedule.schedule_key,
      };
      run = {
        id: crypto.randomUUID(), talent_id: userId, conversation_id: schedule.conversation_id,
        status: "preview", trigger: "career_schedule_due", created_at: new Date().toISOString(),
        trigger_payload: { sourceEvents: [event] },
      };
    }
  }
  if (!run)
    throw new InternalApiError(404, "이 계정에 활성 정기 일정이나 이전 정기 실행이 없습니다.");
  let conversationId = run.conversation_id;
  if (!conversationId) {
    const conversation = await admin.from("talent_conversations").select("id")
      .eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (conversation.error) throw conversation.error;
    conversationId = conversation.data?.id ?? null;
  }
  if (!conversationId) throw new InternalApiError(404, "이 계정의 Career 대화가 없습니다.");
  send({ type: "started", account: account.data.name ?? userId, trigger: run.trigger });
  const [history, inbox] = await Promise.all([
    admin.from("career_email_messages").select("id,subject,body_text,occurred_at")
      .eq("talent_id", userId).eq("direction", "outbound").eq("status", "sent")
      .order("occurred_at", { ascending: false }).limit(5),
    prepareCareerInboxContext({ admin, userId, run, skipGmail: true }),
  ]);
  if (history.error) throw history.error;
  const emailHistory = (history.data ?? []).map(row =>
    `Sent email ${row.id}, ${formatLlmDateTime(row.occurred_at)} Asia/Seoul\nSubject: ${row.subject}\n${row.body_text}`
  ).join("\n\n");

  const contacts: CareerRunContact[] = [];
  let turn = 0;
  const usage: LlmDebugCall[] = [];
  let outcome = "";
  const readUsage = () => {
    const summary = summarizeLlmDebugCalls(usage);
    return {
      calls: summary.completionCount,
      unpriced: usage.filter(call => call.estimatedCostUsd === null).length,
      estimatedUsd: summary.estimatedCostUsd,
      models: summary.models,
    };
  };
  const requestId = crypto.randomUUID();

  try {
    await withLlmUsageContext({ requestId, previewUsage: usage }, () =>
      withToolTrace(async event => {
        if (!event.callId) return;
        const result = event.result as { status?: string } | undefined;
        const status = event.phase === "started" ? "running"
          : event.phase === "threw" || (result && "ok" in result && result.ok === false) ? "failed"
          : result?.status === "preview_skipped" ? "skipped"
          : result?.status === "previewed" ? "preview" : "read";
        send({ type: "tool", tool: {
          id: event.executionId, turn, name: event.name,
          ...(event.phase === "started" ? { input: event.input ?? {} } : {}),
          durationMs: event.durationMs ?? null, status,
        } });
      }, () => previewCareerBackgroundTurn({
        admin, userId, conversationId,
        ...getScheduledCareerModelOptions(),
        abortSignal: signal,
        backgroundInvocation: { runId: run.id, trigger: run.trigger, scheduledWork: isScheduledCareerRun(run), sourceMessageCursor: 0 },
        proactiveContext: [
          renderCareerBackgroundInvocation(run),
          inbox.text,
          emailHistory ? `Recent candidate-visible email history:\n${emailHistory}` : "No recent outbound email in this window.",
          "This is a read-only preview of the stored occurrence with current context. Use the normal Career task and facts. Contact tools capture proposed content for the operator without delivering it. Other writes and external actions are unavailable. Treat their receipts as preview-only and do not retry unavailable effects.",
        ].join("\n\n"),
      }, {
        onComplete: text => { outcome = text; },
        onModelTurn: (index, phase, model) => {
          turn = index;
          send({ type: "turn", turn, phase, model, usage: readUsage() });
        },
        executeTool: async ({ name, input, executeRead }) => {
          if (name === "contact_user" || name === "deliver_career_email") {
            const channel = name === "deliver_career_email" ? "email" : input.channel;
            const action = name === "deliver_career_email" ? input.action ?? "deliver" : "deliver";
            if (action === "read")
              return { status: "previewed", modelOutput: contacts.some(contact => contact.channel === "email") ? "An email is captured in this preview. No email was sent." : "No email is captured in this preview." };
            if (action === "deliver" && (channel === "email" || channel === "chat")) {
              const body = typeof input.body === "string" ? input.body : "";
              const subject = typeof input.subject === "string" ? input.subject : "";
              if (!body.trim() || (channel === "email" && !subject.trim()))
                throw new Error("Contact requires a body and email requires a subject");
              if (channel === "chat" || !contacts.some(contact => contact.channel === "email")) {
                const contact = channel === "email"
                  ? { channel, subject, text: renderReplyEmail(body, { footer: true }).text } as const
                  : { channel, text: body } as const;
                contacts.push(contact);
                send({ type: "contact", contact });
              }
              return { status: "previewed", modelOutput: "Contact content captured in memory for this preview. Nothing was delivered or saved." };
            }
          }
          if (isReadTool(name, input)) return executeRead();
          return { status: "preview_skipped", modelOutput: "This action was not executed in the read-only preview. It has no side effects." };
        },
      }))
    );
  } catch {
    send({ type: "error", message: signal.aborted
      ? "실행 시간이 초과되었거나 요청이 종료되었습니다."
      : "모델 실행 중 오류가 발생했습니다." });
    return;
  }
  send({ type: "completed", elapsedMs: Date.now() - started, outcome, usage: readUsage() });
}
