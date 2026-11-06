import { randomUUID } from "node:crypto";
import type { AgentContactSource, AgentContactMessage } from "./contracts";
import { agentContactReceipt } from "./contracts";
import { companyAgentScope } from "./companyScope";
import {
  agentContactDatabase,
  assertAgentContactPair,
  assertAgentContactSource,
  sendAgentContact,
} from "./store";
import { readAgentCorrespondence } from "./read";
import { manageCompanySchedule, CompanyScheduleInputError } from "./schedules";
import type { Database } from "@/lib/career/matching/internalScoring/database";

export function companyContactSource(args: {
  admin: object;
  workspaceId: string;
  userId: string;
  sourceMessageId: number;
}): Exclude<AgentContactSource, { kind: "career" }> {
  return (
    companyAgentScope(args.admin) ?? {
      kind: "company",
      workspaceId: args.workspaceId,
      userId: args.userId,
      messageId: args.sourceMessageId,
    }
  );
}

export async function executeCompanyCorrespondence(
  args: {
    source: Exclude<AgentContactSource, { kind: "career" }>;
    name: string;
    input: Record<string, any>;
    sourceMessageId: number;
    conversationId: string;
    model?: string;
  },
  database: Database = agentContactDatabase()
) {
  const { source, input } = args;
  if (source.kind === "company_event" && !input.introductionRootId) {
    const [job] = await database.query(
      "SELECT action_context FROM public.company_agent_web_action_jobs WHERE id=$1::uuid",
      [source.jobId]
    );
    if (job?.action_context?.introductionRootId)
      input.introductionRootId = job.action_context.introductionRootId;
    else if (job?.action_context?.scheduleId) {
      const [schedule] = await database.query(
        "SELECT target_refs FROM public.company_agent_schedules WHERE id=$1::uuid",
        [job.action_context.scheduleId]
      );
      if (schedule?.target_refs?.introductionRootId)
        input.introductionRootId = schedule.target_refs.introductionRootId;
    }
  }
  const operationKey = `${source.kind === "company_event" ? source.jobId : source.messageId}:${args.name}:${input.introductionRootId ?? input.roleId ?? ""}:${input.channel ?? input.scheduleId ?? input.operationId ?? ""}`;
  if (args.name === "read_agent_messages")
    return readAgentCorrespondence(source, input, database);
  if (args.name === "manage_agent_schedule") {
    if (input.action === "create" && !String(input.operationId ?? "").trim())
      throw new Error(
        "A stable operationId is required for creating a schedule; reuse it only for the same request."
      );
    return manageCompanySchedule(source, input, operationKey, database).catch(async (error) => {
      // A refused schedule change goes back to the model to correct; it does
      // not fail the run (event and schedule runs throw other tool errors).
      if (!(error instanceof CompanyScheduleInputError)) throw error;
      const { OrgAgentToolInputError } = await import("@/lib/org/agent/toolAvailability");
      throw new OrgAgentToolInputError(error.message);
    });
  }
  if (args.name === "contact_talent") {
    const result = await sendAgentContact(
      {
        source,
        operationKey,
        message: String(input.messageContent ?? ""),
        rootId: input.introductionRootId,
        replyToMessageId: input.replyToMessageId,
      },
      database
    );
    return agentContactReceipt(result.message, result.reused);
  }
  if (args.name === "publish_role_recommendations") {
    return database.transaction(async (q) => {
      const [identity] = await q(
        "SELECT * FROM public.agent_contact_messages WHERE id=$1::uuid AND root_id=id",
        [input.introductionRootId]
      );
      if (!identity || identity.company_workspace_id !== source.workspaceId)
        throw new Error("Introduction not available to this company");
      await q(
        "SELECT pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||$1,0))",
        [identity.talent_id]
      );
      const [rec] = await q(
        "SELECT * FROM public.talent_opportunity_recommendation WHERE id=$1::uuid FOR UPDATE",
        [identity.recommendation_id]
      );
      const [root] = await q(
        "SELECT * FROM public.agent_contact_messages WHERE id=$1::uuid FOR UPDATE",
        [identity.id]
      );
      await assertAgentContactSource(q, source, root.role_id, root.talent_id);
      await assertAgentContactPair(q, root as AgentContactMessage);
      if (
        root.cancelled_at ||
        rec.agent_introduction_root_id !== root.id ||
        rec.feedback !== "like"
      )
        throw new Error("Introduction was withdrawn or superseded");
      if (input.roleId && input.roleId !== root.role_id)
        throw new Error("Introduction Role mismatch");
      const [existing] = await q(
        "SELECT id FROM public.talent_progress WHERE metadata->>'agentIntroductionRootId'=$1 AND kind='intro_to_company'",
        [root.id]
      );
      if (existing)
        return {
          status: "saved",
          modelOutput: `Candidate presentation ${existing.id} already saved for introduction ${root.id}. No new human delivery.`,
        };
      const [advanced] = await q(
        "SELECT tag FROM public.talent_opportunity_tag WHERE talent_id=$1::uuid AND opportunity_id=$2::uuid AND (tag IN ('내부:연결됨','내부:최종오퍼','내부:프로세스중단','내부:거절','내부:아카이브') OR tag LIKE '내부단계:%') LIMIT 1",
        [root.talent_id, root.role_id]
      );
      if (advanced || rec.opportunity_type === "intro_request")
        return {
          status: "unchanged",
          modelOutput:
            "The existing company decision or hiring process is preserved. No presentation or pipeline change was made.",
        };
      const explanation = String(input.presentation ?? "").trim();
      if (!explanation)
        throw new Error(
          "The company's original agent must provide the candidate presentation"
        );
      await q(
        "DELETE FROM public.talent_opportunity_tag WHERE talent_id=$1::uuid AND opportunity_id=$2::uuid AND tag IN ('내부:추천','내부:수락')",
        [root.talent_id, root.role_id]
      );
      await q(
        "INSERT INTO public.talent_opportunity_tag(talent_id,opportunity_id,tag) VALUES($1::uuid,$2::uuid,'내부:연결대기') ON CONFLICT DO NOTHING",
        [root.talent_id, root.role_id]
      );
      await q(
        "UPDATE public.talent_opportunity_recommendation SET processed_stage='pending_connection',updated_at=now() WHERE id=$1::uuid",
        [rec.id]
      );
      const [progress] = await q(
        `INSERT INTO public.talent_progress(talent_id,role_id,recommendation_id,user_id,kind,text,metadata,open_to_company)
        VALUES($1::uuid,$2::uuid,$3::uuid,$1::uuid,'intro_to_company',$4,$5::jsonb,true) RETURNING id`,
        [
          root.talent_id,
          root.role_id,
          rec.id,
          explanation,
          JSON.stringify({
            agentIntroductionRootId: root.id,
            deliveryOwner: "agent_contact_v1",
            companyPresentation: {
              tldr: explanation,
              harperNote: "",
              criteriaEvaluations: [],
            },
            sharedMaterialId: rec.shared_material_id,
          }),
        ]
      );
      return {
        status: "saved",
        modelOutput: `Candidate presentation ${progress.id} saved to the company's Role inbox for introduction ${root.id}. Connection awaits the company's decision. No human notification was sent.`,
      };
    });
  }
  if (args.name !== "contact_user")
    throw new Error("Unknown correspondence operation");
  const body = String(input.body ?? "");
  if (!body.trim()) throw new Error("Message body required");
  if (input.channel === "email") {
    const { contactCompanyByEmail } = await import("./companyEmail.server");
    return contactCompanyByEmail({
      source,
      operationKey,
      body,
      subject: String(input.subject ?? ""),
      roleId: source.kind === "company_event" ? source.roleId : input.roleId,
      rootId: input.introductionRootId,
    });
  }
  if (!["chat", "slack"].includes(input.channel))
    throw new Error("Unsupported company contact channel");
  const result = await database.transaction(async (q) => {
    const roleId =
      source.kind === "company_event" ? source.roleId : input.roleId;
    if (!roleId) throw new Error("Exact Role required");
    await assertAgentContactSource(q, source, roleId);
    if (input.introductionRootId) {
      const [root] = await q(
        "SELECT * FROM public.agent_contact_messages WHERE id=$1::uuid AND id=root_id AND cancelled_at IS NULL FOR SHARE",
        [input.introductionRootId]
      );
      if (
        !root ||
        root.role_id !== roleId ||
        root.company_workspace_id !== source.workspaceId
      )
        throw new Error("Introduction audience mismatch");
      await assertAgentContactSource(q, source, roleId, root.talent_id);
      await assertAgentContactPair(q, root as AgentContactMessage);
    }
    await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      operationKey,
    ]);
    const [existing] = await q(
      "SELECT * FROM public.company_messages WHERE company_workspace_id=$1::uuid AND metadata->>'agentContactDeliveryKey'=$2",
      [source.workspaceId, operationKey]
    );
    if (existing) return existing;
    let channel: any = null;
    if (input.channel === "slack") {
      const { getSupabaseAdmin } = await import("@/lib/server/candidateAccess");
      const { isHarperSlackAudienceAllowed } =
        await import("@/lib/org/slackHarper");
      const { data, error } = await getSupabaseAdmin()
        .from("company_slack_channels")
        .select("id,slack_channel_id")
        .eq("company_workspace_id", source.workspaceId)
        .eq("is_enabled", true);
      if (error) throw error;
      const allowed = [];
      for (const candidate of data ?? [])
        if (
          await isHarperSlackAudienceAllowed({
            workspaceId: source.workspaceId,
            roleId,
            channelId: candidate.slack_channel_id,
          })
        )
          allowed.push(candidate);
      if (allowed.length !== 1)
        throw new Error(
          "An unambiguous approved Role Slack audience is required; use the Role chat"
        );
      channel = allowed[0];
    }
    const batchId = channel ? randomUUID() : null;
    await q(
      'INSERT INTO public.company_conversations(company_workspace_id,role_id,metadata) VALUES($1::uuid,$2::uuid,\'{"phase":"completed","scope":"role_creation"}\') ON CONFLICT DO NOTHING',
      [source.workspaceId, roleId]
    );
    const [conversation] = await q(
      "SELECT id FROM public.company_conversations WHERE company_workspace_id=$1::uuid AND role_id=$2::uuid",
      [source.workspaceId, roleId]
    );
    const [message] = await q(
      `INSERT INTO public.company_messages(company_workspace_id,conversation_id,role_id,role,content,message_type,status,model,metadata)
      VALUES($1::uuid,$2::uuid,$3::uuid,'assistant',$4,$5,'completed',$6,$7::jsonb) RETURNING *`,
      [
        source.workspaceId,
        conversation.id,
        roleId,
        body,
        input.channel,
        args.model ?? null,
        JSON.stringify({
          source: "agent_contact",
          agentContactDeliveryKey: operationKey,
          agentIntroductionRootId: input.introductionRootId ?? null,
          webActionJobId: source.kind === "company_event" ? source.jobId : null,
          ...(batchId
            ? {
                companyMessageBatch: {
                  batchId,
                  ref: "message",
                  sourceMessageId: args.sourceMessageId,
                  channelDbId: channel.id,
                },
              }
            : {}),
        }),
      ]
    );
    return message;
  });
  if (result.metadata?.companyMessageBatch) {
    const { deliverCompanyMessageBatch } =
      await import("@/lib/org/agent/companyMessageDelivery.server");
    await deliverCompanyMessageBatch({
      batchId: result.metadata.companyMessageBatch.batchId,
      workspaceId: source.workspaceId,
      assertCanStart: async () => {
        const q = agentContactDatabase().query;
        await assertAgentContactSource(q, source, result.role_id);
        if (result.metadata.agentIntroductionRootId) {
          const [root] = await q(
            "SELECT * FROM public.agent_contact_messages WHERE id=$1::uuid AND id=root_id AND cancelled_at IS NULL",
            [result.metadata.agentIntroductionRootId]
          );
          if (!root) throw new Error("Introduction was withdrawn");
          await assertAgentContactPair(q, root as AgentContactMessage);
        }
      },
    });
    return {
      status: "sent",
      modelOutput: `Message ${result.id} delivered to the approved company Slack audience. Readership is unknown.`,
    };
  }
  return {
    status: "saved",
    modelOutput: `Message ${result.id} saved in the company's Role chat. Readership is unknown.`,
  };
}
