import { randomUUID } from "node:crypto";
import {
  internalScoringDatabase,
  type Database,
  type Query,
} from "@/lib/career/matching/internalScoring/database";
import {
  AGENT_CONTACT_CONTRACT,
  decodeMaterialSelection,
  type AgentContactMessage,
  type AgentContactSource,
} from "./contracts";

export const agentContactDatabase = internalScoringDatabase;
export class AgentContactSupersededError extends Error {}

export async function assertAgentContactSource(
  query: Query,
  source: AgentContactSource,
  roleId: string,
  talentId?: string
) {
  if (source.kind === "career") {
    if (talentId && source.talentId !== talentId)
      throw new Error("Candidate source mismatch");
    if (source.voiceEventId) {
      const [event] = await query(
        `SELECT id,created_at FROM public.talent_external_operations WHERE id=$1::uuid AND user_id=$2::uuid
        AND conversation_id=$3::uuid AND kind='voice_tool_request' AND request->>'toolName'='contact_company'`,
        [source.voiceEventId, source.talentId, source.conversationId]
      );
      if (!event)
        throw new Error("Authenticated voice tool source unavailable");
      return event;
    }
    if (source.messageId) {
      const [message] = await query(
        `SELECT id,payload,message_type,created_at FROM public.talent_messages
        WHERE id=$1 AND user_id=$2::uuid AND conversation_id=$3::uuid AND role='user'`,
        [source.messageId, source.talentId, source.conversationId]
      );
      if (!message) throw new Error("Candidate source message unavailable");
      return message;
    }
    const [run] = await query(
      `SELECT id,trigger_payload FROM public.opportunity_discovery_run WHERE id=$1::uuid
      AND talent_id=$2::uuid AND conversation_id=$3::uuid AND status='handed_off' AND trigger_payload->>'runContract'='career_agent_v1'`,
      [source.backgroundRunId ?? null, source.talentId, source.conversationId]
    );
    if (!run) throw new Error("Candidate delegation unavailable");
    for (const event of run.trigger_payload?.sourceEvents ?? [])
      if (event.sourceKind === "agent_contact") {
        const [message] = await query(
          `SELECT m.* FROM public.agent_contact_messages m
        JOIN public.agent_contact_messages root ON root.id=m.root_id
        JOIN public.talent_opportunity_recommendation r ON r.id=m.recommendation_id AND r.agent_introduction_root_id=m.root_id
        WHERE m.id=$1::uuid AND m.receiver_job_id=$2::uuid AND m.talent_id=$3::uuid AND root.cancelled_at IS NULL AND r.feedback='like'
        FOR SHARE OF r,root`,
          [event.sourceId, run.id, source.talentId]
        );
        if (!message)
          throw new AgentContactSupersededError(
            "Candidate correspondence was withdrawn or superseded"
          );
        await assertAgentContactPair(query, message as AgentContactMessage);
      }
    return run;
  }
  if (source.kind === "company_event") {
    const [job] = await query(
      `SELECT j.id,j.action_name,j.action_context FROM public.company_agent_web_action_jobs j WHERE j.id=$1::uuid
      AND j.company_workspace_id=$2::uuid AND j.role_id=$3::uuid AND j.status='processing' AND j.locked_by=$4
      AND j.action_name IN ('agent_contact_received','agent_schedule_due')`,
      [source.jobId, source.workspaceId, roleId, source.leaseOwner]
    );
    if (!job || roleId !== source.roleId)
      throw new AgentContactSupersededError(
        "Company event lease or role changed"
      );
    const [available] = await query(
      `SELECT r.role_id FROM public.company_roles r JOIN public.company_workspace w USING(company_workspace_id)
      WHERE r.role_id=$1::uuid AND r.company_workspace_id=$2::uuid AND r.source_type='internal'
      AND NOT coalesce(w.is_reviewing,false) AND r.status IN ('active','paused','top_priority')
      AND NOT coalesce(r.is_expired,false) AND (r.expires_at IS NULL OR r.expires_at>now())`,
      [roleId, source.workspaceId]
    );
    if (!available)
      throw new AgentContactSupersededError(
        "Company Role is no longer available for this event"
      );
    let rootId = job.action_context?.introductionRootId;
    if (job.action_name === "agent_schedule_due") {
      const [schedule] = await query(
        `SELECT * FROM public.company_agent_schedules WHERE id=$1::uuid AND company_workspace_id=$2::uuid AND role_id=$3::uuid
        AND directive_revision=$4 AND (status='active' OR source->>'jobId'=$5)`,
        [
          job.action_context.scheduleId,
          source.workspaceId,
          roleId,
          job.action_context.scheduleRevision,
          source.jobId,
        ]
      );
      if (!schedule)
        throw new AgentContactSupersededError(
          "Company schedule was changed or cancelled"
        );
      rootId = schedule.target_refs?.introductionRootId;
    }
    if (rootId) {
      const [root] = await query(
        `SELECT m.* FROM public.agent_contact_messages m JOIN public.talent_opportunity_recommendation r ON r.agent_introduction_root_id=m.id
        WHERE m.id=$1::uuid AND m.id=m.root_id AND m.role_id=$2::uuid AND m.company_workspace_id=$3::uuid AND m.cancelled_at IS NULL AND r.feedback='like' FOR SHARE OF r,m`,
        [rootId, roleId, source.workspaceId]
      );
      if (!root)
        throw new AgentContactSupersededError(
          "Introduction was withdrawn or superseded"
        );
      if (talentId && root.talent_id !== talentId)
        throw new Error(
          "This company event does not authorize another candidate relationship"
        );
      await assertAgentContactPair(query, root as AgentContactMessage);
    }
    return job;
  }
  const [member] = await query(
    `SELECT m.id FROM public.company_user_workspace m
    JOIN public.company_roles r ON r.company_workspace_id=m.company_workspace_id
    JOIN public.company_internal_roles i ON i.role_id=r.role_id
    WHERE m.company_workspace_id=$1::uuid AND m.company_user_id=$2::uuid AND r.role_id=$3::uuid
      AND m.authority IN ('owner','admin')
      AND (m.authority='owner' OR coalesce(m.access_scope,'organization')='organization' OR m.team_id=i.team_id
        OR EXISTS(SELECT 1 FROM public.company_workspace_team_members tm WHERE tm.membership_id=m.id AND tm.team_id=i.team_id))
    FOR SHARE OF m`,
    [source.workspaceId, source.userId, roleId]
  );
  if (!member) throw new Error("Company role permission unavailable");
  const [message] = await query(
    `SELECT id FROM public.company_messages WHERE id=$1 AND company_workspace_id=$2::uuid
    AND company_user_id=$3::uuid AND role='user'`,
    [source.messageId, source.workspaceId, source.userId]
  );
  if (!message) throw new Error("Company source message unavailable");
  return member;
}

export async function assertAgentContactPair(
  query: Query,
  row: Pick<
    AgentContactMessage,
    "role_id" | "talent_id" | "company_workspace_id" | "recommendation_id"
  >,
  sharing = false
) {
  const [pair] = await query(
    `SELECT r.role_id,s.profile_visibility FROM public.company_roles r
    JOIN public.company_workspace w ON w.company_workspace_id=r.company_workspace_id
    JOIN public.talent_opportunity_recommendation rec ON rec.role_id=r.role_id AND rec.id=$4::uuid AND rec.talent_id=$2::uuid
    JOIN public.talent_users t ON t.user_id=rec.talent_id AND t.deleted_at IS NULL
    JOIN public.talent_setting s ON s.user_id=t.user_id
    WHERE r.role_id=$1::uuid AND r.company_workspace_id=$3::uuid AND r.source_type='internal'
      AND NOT coalesce(w.is_reviewing,false) AND r.status IN ('active','paused','top_priority') AND NOT coalesce(r.is_expired,false) AND (r.expires_at IS NULL OR r.expires_at>now())
      AND (lower(coalesce(r.information->>'testOnly','false')) NOT IN ('true','1','yes','on')
        OR (nullif(r.information->>'testFixture','') IS NOT NULL AND coalesce(r.information->'testTalentIds','[]') ? t.user_id::text))
      AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(s.blocked_companies,'{}')) b
        WHERE lower(btrim(b)) IN (lower(btrim(w.company_name)),lower(btrim(coalesce(w.published_name,''))),lower(w.company_workspace_id::text)))
    FOR SHARE OF r,t,s`,
    [
      row.role_id,
      row.talent_id,
      row.company_workspace_id,
      row.recommendation_id,
    ]
  );
  if (!pair)
    throw new AgentContactSupersededError(
      "Introduction relationship unavailable"
    );
  if (sharing && pair.profile_visibility === "dont_share")
    throw new Error("Profile sharing is disabled");
}

/** Rechecked by background email immediately before delivery, not only at model invocation. */
export async function isCareerAgentContactEventCurrent(
  messageId: string,
  runId: string,
  talentId: string,
  db: Database = agentContactDatabase()
) {
  return db.transaction(async (q) => {
    const [message] = await q(
      `SELECT m.* FROM public.agent_contact_messages m
      JOIN public.agent_contact_messages root ON root.id=m.root_id
      JOIN public.talent_opportunity_recommendation r ON r.id=m.recommendation_id
      WHERE m.id=$1::uuid AND m.talent_id=$2::uuid AND m.receiver_job_id=$3::uuid
      AND root.cancelled_at IS NULL AND r.agent_introduction_root_id=root.id AND r.feedback='like'
      FOR SHARE OF r,root`,
      [messageId, talentId, runId]
    );
    if (!message) return false;
    try {
      await assertAgentContactPair(q, message as AgentContactMessage);
      return true;
    } catch (error) {
      if (error instanceof AgentContactSupersededError) return false;
      throw error;
    }
  });
}

/** Called inside the same transaction as mailbox insertion. Queue publication is recoverable. */
export async function enqueueAgentContactReceiver(
  query: Query,
  message: AgentContactMessage
) {
  if (message.receiver_job_id) return message;
  if (message.direction === "to_company") {
    const [job] = await query(
      `SELECT public.enqueue_agent_company_event_v1($1::uuid,$2::uuid,$3,$4::jsonb) AS id`,
      [
        message.company_workspace_id,
        message.role_id,
        `agent-message:${message.id}`,
        JSON.stringify({
          messageId: message.id,
          introductionRootId: message.root_id,
          agentContactBudgetAnchor:
            (message as any).execution_usage?.causalBudgetId ?? message.id,
        }),
      ]
    );
    const [saved] = await query(
      `UPDATE public.agent_contact_messages SET receiver_job_id=$2::uuid,receiver_kind='company'
      WHERE id=$1::uuid RETURNING *`,
      [message.id, job.id]
    );
    return saved as AgentContactMessage;
  }
  const [conversation] = await query(
    `SELECT id FROM public.talent_conversations WHERE user_id=$1::uuid ORDER BY updated_at DESC,id LIMIT 1`,
    [message.talent_id]
  );
  const [run] = await query(
    `INSERT INTO public.opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,trigger_payload)
    VALUES($1::uuid,$2::uuid,'agent_contact_received','refresh','queued',$3,$4::jsonb)
    ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET dedupe_key=excluded.dedupe_key RETURNING id`,
    [
      message.talent_id,
      conversation?.id ?? null,
      `agent-message:${message.id}`,
      JSON.stringify({
        runContract: "career_agent_v1",
        agentContactBudgetAnchor:
          (message as any).execution_usage?.causalBudgetId ?? message.id,
        contactScope: "delegated_work",
        instruction:
          "A company agent sent correspondence. Read the exact message and current relationship, then continue the candidate's purpose within their existing authorization.",
        sourceEvents: [
          {
            sourceKind: "agent_contact",
            sourceId: message.id,
            rootId: message.root_id,
            revision: 1,
            roleId: message.role_id,
          },
        ],
      }),
    ]
  );
  const [saved] = await query(
    `UPDATE public.agent_contact_messages SET receiver_job_id=$2::uuid,receiver_kind='career' WHERE id=$1::uuid RETURNING *`,
    [message.id, run.id]
  );
  return saved as AgentContactMessage;
}

export type SendAgentContact = {
  source: AgentContactSource;
  operationKey: string;
  message: string;
  roleId?: string;
  recommendationId?: string;
  rootId?: string;
  replyToMessageId?: string;
  acceptIntroduction?: boolean;
  selectionRef?: string;
  documentRefs?: Array<{ documentId: string; revision: number }>;
};

export async function sendAgentContact(
  args: SendAgentContact,
  db: Database = agentContactDatabase()
) {
  if (!args.message.trim() || !args.operationKey)
    throw new Error("Message and operation key required");
  return db.transaction(async (query) => {
    let root: AgentContactMessage | undefined;
    let reply: AgentContactMessage | undefined;
    if (args.replyToMessageId) {
      [reply] = (await query(
        "SELECT * FROM public.agent_contact_messages WHERE id=$1::uuid",
        [args.replyToMessageId]
      )) as AgentContactMessage[];
      if (!reply || (args.rootId && reply.root_id !== args.rootId))
        throw new Error("Reply relationship unavailable");
    }
    const rootId = args.rootId ?? reply?.root_id;
    if (rootId)
      [root] = (await query(
        "SELECT * FROM public.agent_contact_messages WHERE id=$1::uuid AND id=root_id",
        [rootId]
      )) as AgentContactMessage[];
    if (rootId && !root) throw new Error("Introduction unavailable");
    let recommendationId = args.recommendationId ?? root?.recommendation_id;
    if (!recommendationId)
      throw new Error(
        "Exact recommendation or introduction reference required"
      );
    // Same order as the existing acceptance coordinator: candidate, recommendation, material.
    const [identity] = await query(
      "SELECT talent_id,role_id FROM public.talent_opportunity_recommendation WHERE id=$1::uuid",
      [recommendationId]
    );
    if (!identity) throw new Error("Opportunity unavailable");
    await query(
      "SELECT pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||$1,0))",
      [identity.talent_id]
    );
    const [rec] = await query(
      "SELECT rec.*,r.company_workspace_id FROM public.talent_opportunity_recommendation rec JOIN public.company_roles r USING(role_id) WHERE rec.id=$1::uuid FOR UPDATE OF rec",
      [recommendationId]
    );
    if (
      (args.roleId && rec.role_id !== args.roleId) ||
      (root &&
        (root.recommendation_id !== rec.id || root.role_id !== rec.role_id))
    )
      throw new Error("Opportunity relationship mismatch");
    if (
      args.source.kind !== "career" &&
      args.source.workspaceId !== rec.company_workspace_id
    )
      throw new Error("Company source mismatch");
    const source = await assertAgentContactSource(
      query,
      args.source,
      rec.role_id,
      rec.talent_id
    );
    const direction =
      args.source.kind === "career" ? "to_company" : "to_talent";
    const [existing] = await query(
      "SELECT * FROM public.agent_contact_messages WHERE talent_id=$1::uuid AND direction=$2 AND operation_key=$3",
      [rec.talent_id, direction, args.operationKey]
    );
    if (existing) {
      if (
        existing.recommendation_id !== rec.id ||
        existing.company_workspace_id !== rec.company_workspace_id
      )
        throw new Error("Operation key belongs to another relationship");
      return { message: existing as AgentContactMessage, reused: true };
    }
    if (args.acceptIntroduction && args.source.kind !== "career")
      throw new Error("Only the candidate can accept an introduction");
    if (
      args.acceptIntroduction &&
      source.created_at &&
      rec.feedback_at &&
      new Date(source.created_at) < new Date(rec.feedback_at) &&
      (rec.feedback === "dislike" || rec.saved_stage === "closed")
    )
      throw new AgentContactSupersededError(
        "A later candidate decision superseded this request"
      );
    if (args.acceptIntroduction && !rec.agent_introduction_root_id) {
      const [legacy] = await query(
        `SELECT id FROM public.talent_progress WHERE recommendation_id=$1::uuid AND kind='intro_to_company'
        AND coalesce(metadata->>'deliveryOwner','')<>'agent_contact_v1' LIMIT 1`,
        [rec.id]
      );
      if (legacy)
        throw new Error(
          "An existing introduction already owns this request. Read its recorded progress or use the existing company connection; no second introduction was created."
        );
    }
    if (args.acceptIntroduction && rec.agent_introduction_root_id) {
      const [current] = await query(
        "SELECT * FROM public.agent_contact_messages WHERE id=$1::uuid AND cancelled_at IS NULL",
        [rec.agent_introduction_root_id]
      );
      if (current && rec.feedback === "like" && rec.saved_stage !== "closed")
        return { message: current as AgentContactMessage, reused: true };
    }
    // Intake can stop without changing the recipient contract or stranding accepted work.
    if (
      args.acceptIntroduction &&
      process.env.AGENT_INTRODUCTION_ACCEPTING === "false"
    )
      throw new Error(
        "New agent introductions are temporarily unavailable. No introduction was accepted or sent; the saved opportunity is unchanged."
      );
    if (!args.acceptIntroduction && !root)
      throw new Error("An existing introduction is required for follow-up");
    if (root) {
      [root] = (await query(
        "SELECT * FROM public.agent_contact_messages WHERE id=$1::uuid FOR UPDATE",
        [root.id]
      )) as AgentContactMessage[];
      if (root.cancelled_at || rec.agent_introduction_root_id !== root.id)
        throw new Error("Introduction has been withdrawn or superseded");
    }
    await assertAgentContactPair(
      query,
      {
        role_id: rec.role_id,
        talent_id: rec.talent_id,
        company_workspace_id: rec.company_workspace_id,
        recommendation_id: rec.id,
      },
      Boolean(args.acceptIntroduction || args.selectionRef)
    );
    let selectionRef = args.selectionRef;
    if (source.message_type === "agent_introduction_action") {
      if (source.payload?.recommendationId !== rec.id)
        throw new Error("Introduction action target mismatch");
      if (selectionRef && selectionRef !== source.payload.selectionRef)
        throw new Error("Reviewed material selection changed");
      selectionRef = source.payload.selectionRef;
      if (!selectionRef)
        throw new Error("Reviewed material selection unavailable");
      const reviewedAt = source.payload.decisionAt
        ? new Date(source.payload.decisionAt).getTime()
        : null;
      const currentAt = rec.feedback_at
        ? new Date(rec.feedback_at).getTime()
        : null;
      if (reviewedAt !== currentAt)
        throw new Error("Opportunity decision changed after the action");
    }
    const id = randomUUID();
    let materialId = rec.shared_material_id ?? root?.material_id ?? null;
    if (args.acceptIntroduction || selectionRef) {
      if (args.source.kind !== "career")
        throw new Error("Only the candidate can share new materials");
      const selection = decodeMaterialSelection(selectionRef);
      const [pin] = await query(
        "SELECT public.pin_agent_contact_material_v1($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb) AS id",
        [
          rec.talent_id,
          rec.role_id,
          `agent-contact:${args.operationKey}`,
          selection ? JSON.stringify(selection) : null,
          JSON.stringify(args.source),
        ]
      );
      materialId = pin.id;
    }
    const docs = args.documentRefs ?? [];
    for (const doc of docs) {
      if (direction === "to_talent")
        throw new Error(
          "Company attachments require an approved company document reference"
        );
      const [owned] = await query(
        "SELECT id FROM public.talent_documents WHERE id=$1::uuid AND talent_id=$2::uuid AND coalesce(revision,1)=$3 AND NOT is_deleted FOR SHARE",
        [doc.documentId, rec.talent_id, doc.revision]
      );
      if (!owned) throw new Error("Attachment revision unavailable");
    }
    const introductionId = args.acceptIntroduction ? id : root!.id;
    const [inserted] = await query(
      `INSERT INTO public.agent_contact_messages(id,root_id,reply_to_id,company_workspace_id,role_id,talent_id,recommendation_id,direction,body,material_id,document_refs,source,operation_key)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8,$9,$10::uuid,$11::jsonb,$12::jsonb,$13) RETURNING *`,
      [
        id,
        introductionId,
        args.replyToMessageId ?? null,
        rec.company_workspace_id,
        rec.role_id,
        rec.talent_id,
        rec.id,
        direction,
        args.message,
        materialId,
        JSON.stringify(docs),
        JSON.stringify(args.source),
        args.operationKey,
      ]
    );
    if (args.acceptIntroduction) {
      const [presentation] = await query(
        "SELECT metadata FROM public.talent_progress WHERE talent_id=$1::uuid AND recommendation_id=$2::uuid AND kind='candidate_role_recommendation_presented' ORDER BY created_at DESC LIMIT 1",
        [rec.talent_id, rec.id]
      );
      const sourceRoleId =
        presentation?.metadata?.targetRoleId === rec.role_id
          ? (presentation.metadata.sourceRoleId ?? null)
          : null;
      // Set ownership before feedback triggers run; old accepted consumers cannot claim it.
      await query(
        "UPDATE public.talent_opportunity_recommendation SET agent_introduction_root_id=$2::uuid,shared_material_id=$3::uuid WHERE id=$1::uuid",
        [rec.id, id, materialId]
      );
      const [decision] = await query(
        rec.opportunity_type === "intro_request"
          ? "SELECT public.decide_company_intro_request_with_material_v1($1::uuid,$2::uuid,'accept',$4,null,null,null,$3::jsonb) AS result"
          : "SELECT public.accept_talent_internal_role_recommendation_v2($1::uuid,$2::uuid,$4::uuid,$5,null,$3::jsonb,null) AS result",
        rec.opportunity_type === "intro_request"
          ? [
              rec.talent_id,
              rec.id,
              JSON.stringify({
                agentContactRootId: id,
                deliveryOwner: AGENT_CONTACT_CONTRACT,
              }),
              source.payload?.feedbackReason ?? null,
            ]
          : [
              rec.talent_id,
              rec.id,
              JSON.stringify({
                agentContactRootId: id,
                deliveryOwner: AGENT_CONTACT_CONTRACT,
              }),
              sourceRoleId,
              source.payload?.feedbackReason ?? null,
            ]
      );
      if (
        decision.result?.status !== "accepted" &&
        !(
          decision.result?.status === "no_change" &&
          (decision.result?.targetAccepted === true ||
            (rec.opportunity_type === "intro_request" &&
              decision.result?.reason === "already_connected"))
        )
      )
        throw new Error(
          `Introduction was not accepted: ${decision.result?.reason ?? decision.result?.status ?? "unknown"}`
        );
      await query(
        "UPDATE public.company_intro_candidates SET agent_introduction_root_id=$2::uuid,shared_material_id=$5::uuid WHERE recommendation_id=$1::uuid AND talent_id=$3::uuid AND role_id=$4::uuid AND status<>'closed'",
        [rec.id, id, rec.talent_id, rec.role_id, materialId]
      );
    } else if (selectionRef) {
      await query(
        "UPDATE public.talent_opportunity_recommendation SET shared_material_id=$2::uuid WHERE id=$1::uuid",
        [rec.id, materialId]
      );
      await query(
        "UPDATE public.company_intro_candidates SET shared_material_id=$2::uuid WHERE recommendation_id=$1::uuid AND agent_introduction_root_id=$3::uuid",
        [rec.id, materialId, root!.id]
      );
    }
    const { sourceBudgetAnchor } = await import("./executionBudget");
    const anchor = (await sourceBudgetAnchor(query, args.source)) ?? id;
    const [ready] = await query(
      "UPDATE public.agent_contact_messages SET execution_usage=jsonb_build_object('causalBudgetId',$2::text) WHERE id=$1::uuid RETURNING *",
      [id, anchor]
    );
    return {
      message: await enqueueAgentContactReceiver(
        query,
        ready as AgentContactMessage
      ),
      reused: false,
    };
  });
}

export async function readAgentContacts(
  args: {
    source: AgentContactSource;
    rootId?: string;
    roleId?: string;
    messageId?: string;
    offset?: number;
    limit?: number;
  },
  db: Database = agentContactDatabase()
) {
  const rows = (await db.query(
    `SELECT m.*,root.cancelled_at,CASE WHEN m.receiver_kind='company' THEN company_job.status ELSE career_run.status END AS receiver_status
    FROM public.agent_contact_messages m JOIN public.agent_contact_messages root ON root.id=m.root_id
    LEFT JOIN public.company_agent_web_action_jobs company_job ON m.receiver_kind='company' AND company_job.id=m.receiver_job_id AND company_job.company_workspace_id=m.company_workspace_id
    LEFT JOIN public.opportunity_discovery_run career_run ON m.receiver_kind='career' AND career_run.id=m.receiver_job_id AND career_run.talent_id=m.talent_id
    JOIN public.talent_users live_talent ON live_talent.user_id=m.talent_id AND live_talent.deleted_at IS NULL
    JOIN public.talent_setting settings ON settings.user_id=m.talent_id
    JOIN public.company_workspace workspace ON workspace.company_workspace_id=m.company_workspace_id
    WHERE ($1::uuid IS NULL OR m.root_id=$1::uuid) AND ($2::uuid IS NULL OR m.role_id=$2::uuid)
      AND ($3::uuid IS NULL OR m.talent_id=$3::uuid) AND ($4::uuid IS NULL OR m.company_workspace_id=$4::uuid)
      AND ($7::uuid IS NULL OR m.id=$7::uuid)
      AND ($4::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM unnest(coalesce(settings.blocked_companies,'{}')) b
        WHERE lower(btrim(b)) IN (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,''))),lower(workspace.company_workspace_id::text))))
    ORDER BY m.created_at,m.id OFFSET $5 LIMIT $6`,
    [
      args.rootId ?? null,
      args.roleId ??
        (args.source.kind === "company_event" ? args.source.roleId : null),
      args.source.kind === "career" ? args.source.talentId : null,
      args.source.kind === "career" ? null : args.source.workspaceId,
      args.offset ?? 0,
      (args.limit ?? 30) + 1,
      args.messageId ?? null,
    ]
  )) as AgentContactMessage[];
  for (const row of rows) {
    if (args.source.kind !== "career")
      await assertAgentContactSource(
        db.query,
        args.source,
        row.role_id,
        row.talent_id
      );
  }
  const limit = args.limit ?? 30;
  return {
    messages: rows.slice(0, limit),
    nextOffset: rows.length > limit ? (args.offset ?? 0) + limit : null,
  };
}
