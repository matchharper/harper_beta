import { randomUUID, createHash } from "node:crypto";
import { getDefaultResendFromEmail, sendResendEmail } from "./send";
import { emailRuntimeEnabled, type EmailAdmin } from "./runtime/types";
import { planSlackConnectionReminder, type ReminderRecipient, type ReminderReceipt } from "./slackConnectionReminder";
import type { composeCompanyUpdateEmail } from "@/lib/org/agent/companyUpdateEmail";

export type ConnectionSnapshot = ReminderRecipient & { email: string; workspaces: Array<ReminderRecipient["workspaces"][number] & { id: string }> };
export type CompanyEmailJob = { id: string; recipient_id: string; ordinal: number; snapshot: ConnectionSnapshot;
  draft?: {subject:string;body:string} | null; delivery: Parameters<typeof sendResendEmail>[0] | null; attempted_at: string | null };
export const CONNECTION_EMAIL_PURPOSE = "Slack에서 채용 소식을 주기적으로 전달하고 팀원과 대화하며 채용을 도울 수 있도록 현재 필요한 Slack/채널/역할 연결을 안내한다. 후보가 아직 없어도 연결 후 함께 채용을 시도하고 소통할 수 있는 가치를 설명할 수 있다. 현재 사실과 이전 안내를 고려해 무엇을 설명할지 판단한다. 상대에게 직접 쓰는 가벼운 개인 메일로 현재 상황과 구체적인 도움을 연결하고 설정 행동까지 자연스럽게 안내한다. 분량은 이 간단한 요청에 비례하게 정한다.";
export function reminderWindow(now: Date) {
  const local = new Date(now.getTime() + 9 * 3600_000);
  return [1,3,5].includes(local.getUTCDay()) && local.getUTCHours() >= 10 && local.getUTCHours() < 18;
}

/** One Workspace per email keeps its eventual reply inside that company's conversation.
 * The cap and clock remain global to the recipient. Rotate unresolved workspaces by round.
 */
export function selectReminderWorkspace(snapshot: ConnectionSnapshot, ordinal: number, baseUrl: string) {
  if (!snapshot.workspaces.length) throw Error("No eligible workspace");
  const workspace = snapshot.workspaces[(ordinal - 1) % snapshot.workspaces.length]!;
  const url = new URL("/org/settings", baseUrl); url.searchParams.set("orgId", workspace.id);
  return { ...snapshot, workspaces: [{ ...workspace, setupUrl: url.toString() }] };
}
async function rpc(admin: EmailAdmin, name: string, args: Record<string, unknown>) {
  const { data, error } = await (admin.rpc as any)(name, args);
  if (error) throw error;
  return data;
}
export async function reserveCompanyConnectionEmail(recipientId: string, owner: string, admin?: EmailAdmin) {
  admin ??= (await import("@/lib/talentOnboarding/server")).getTalentSupabaseAdmin();
  return await rpc(admin, "claim_company_connection_email_v1", { p_user_id: recipientId, p_owner: owner }) as CompanyEmailJob | null;
}

export type DeliveryDependencies = {
  compose: typeof composeCompanyUpdateEmail;
  saveDraft: (job: CompanyEmailJob, owner: string, draft: {subject:string;body:string}) => Promise<void>;
  prepare: (job: CompanyEmailJob, email: { subject: string; body: string }, workspaceId: string) => Promise<Parameters<typeof sendResendEmail>[0]>;
  begin: (job: CompanyEmailJob, owner: string, payload: Parameters<typeof sendResendEmail>[0]) => Promise<CompanyEmailJob | null>;
  send: typeof sendResendEmail;
  finish: (id: string, owner: string, providerId: string) => Promise<void>;
};
/** Shared production orchestration; tests replace external boundaries, never recipient data. */
export async function deliverCompanyConnectionJob(args: {
  job: CompanyEmailJob; owner: string; history: ReminderReceipt[];
  priorMessages: Array<{ role: "user" | "assistant"; content: string }>;
  baseUrl: string; now: Date;
}, deps: DeliveryDependencies) {
  let payload = args.job.delivery;
  if (!payload) {
    const recipient = selectReminderWorkspace(args.job.snapshot, args.job.ordinal, args.baseUrl);
    const plan = planSlackConnectionReminder(recipient, args.history, args.now);
    if (!plan) return "ineligible";
    const composed = args.job.draft ?? await deps.compose({ purpose: CONNECTION_EMAIL_PURPOSE, facts: plan.facts,
      workspaceId: recipient.workspaces[0]!.id,
      locale: recipient.locale, recentConversation: args.priorMessages });
    await deps.saveDraft(args.job,args.owner,{subject:composed.subject,body:composed.body});
    payload = await deps.prepare(args.job, composed, recipient.workspaces[0]!.id);
  }
  const authorized = await deps.begin(args.job, args.owner, payload);
  if (!authorized) return "cancelled";
  // Use the persisted immutable payload, including from, Reply-To, body, and idempotency key.
  const result = await deps.send(authorized.delivery!);
  if (!result.id) throw Error("Provider receipt missing; delivery uncertain");
  await deps.finish(args.job.id, args.owner, result.id);
  return "sent";
}

export async function dispatchCompanyConnectionEmails(admin?: EmailAdmin) {
  // Also respect the established no-send controls during local/debug runs.
  if (!emailRuntimeEnabled() || process.env.EMAIL_REPLY_DRY_RUN === "true" || process.env.COMPANY_EMAIL_DRY_RUN === "true")
    return { sent: 0, deferred: 0, disabled: true };
  if (!reminderWindow(new Date())) return { sent: 0, deferred: 0 };
  admin ??= (await import("@/lib/talentOnboarding/server")).getTalentSupabaseAdmin();
  const { createCompanyEmailReplyAlias } = await import("./company");
  const { renderCompanyReplyEmail } = await import("./runtime/format");
  const { composeCompanyUpdateEmail } = await import("@/lib/org/agent/companyUpdateEmail");
  const { enqueueCompanyUpdate } = await import("@/lib/org/agent/companyUpdate.server");
  let sent = 0, deferred = 0, processed = 0;
  // PostgREST row limits must not silently drop later recipients.
  for (let offset = 0; processed < 2; offset += 500) {
    const { data, error } = await (admin.rpc as any)("company_connection_email_snapshot_v1", {}).range(offset, offset+499);
    if (error) throw error;
    for (const snapshot of (data ?? []) as ConnectionSnapshot[]) {
      const owner = randomUUID();
      const job = await enqueueCompanyUpdate({ emailDelivery: { recipientId: snapshot.id, owner, admin } });
      if (!job) continue;
      processed++;
      try {
        const { data: history, error: historyError } = await (admin as any).from("company_email_outbox")
          .select("id,recipient_id,sent_at,delivery,snapshot,ordinal").eq("recipient_id",snapshot.id).eq("topic","slack_connection")
          .eq("status","sent").order("ordinal");
        if (historyError) throw historyError;
        const target = selectReminderWorkspace(job.snapshot, job.ordinal, publicBaseUrl()).workspaces[0]!;
        const prior = (history ?? []).filter((row: any) =>
          selectReminderWorkspace(row.snapshot,row.ordinal,publicBaseUrl()).workspaces[0]!.id === target.id);
        const result = await deliverCompanyConnectionJob({ job, owner, baseUrl: publicBaseUrl(), now: new Date(),
          history: (history ?? []).map((r: any) => ({ recipientId:r.recipient_id,sentAt:r.sent_at,eventId:r.id })),
          priorMessages: prior.map((r: any) => ({ role: "assistant" as const, content: `${r.delivery.subject}\n${r.delivery.text}` })),
        }, {
          compose: composeCompanyUpdateEmail,
          saveDraft: async (j,lease,draft) => {
            const { data, error } = await (admin as any).from("company_email_outbox").update({draft})
              .eq("id",j.id).eq("lease_owner",lease).eq("status","processing").is("attempted_at",null).select("id").maybeSingle();
            if (error) throw error;
            if (!data) throw Error("Draft lease lost");
          },
          prepare: async (j,email,workspaceId) => {
            const route = await createCompanyEmailReplyAlias({ userId:j.recipient_id,workspaceId,...email,
              idempotencyKey:`company-notice/${j.id}/${createHash("sha256").update(JSON.stringify({workspaceId,recipient:j.snapshot.email,subject:email.subject,body:email.body})).digest("hex")}`,admin });
            return { ...route,from:getDefaultResendFromEmail(),subject:email.subject,
              ...renderCompanyReplyEmail(email.body,workspaceId),idempotencyKey:`company-notice/${j.id}` };
          },
          begin: (j,lease,payload) => rpc(admin,"prepare_company_email_send_v1",{p_id:j.id,p_owner:lease,p_delivery:payload}),
          send: payload => sendResendEmail({ ...payload, signal: AbortSignal.timeout(30_000) }),
          finish: (id,lease,providerId) => rpc(admin,"finish_company_email_send_v1",{p_id:id,p_owner:lease,p_provider_id:providerId}),
        });
        if (result === "sent") sent++;
      } catch (error) {
        deferred++;
        const { error: releaseError } = await (admin as any).from("company_email_outbox")
          .update({status:"queued",lease_owner:null,lease_until:null,available_at:new Date(Date.now()+300_000).toISOString(),
            last_error:error instanceof Error ? error.message.slice(0,1000) : "Company email failed"})
          .eq("id",job.id).eq("lease_owner",owner).in("status",["processing","sending"]);
        if (releaseError) throw releaseError;
      }
      if (processed>=2) break;
    }
    if ((data ?? []).length<500) break;
  }
  return {sent,deferred};
}
function publicBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://matchharper.com";
}
