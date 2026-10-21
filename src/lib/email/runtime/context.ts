import { OPS_CONTACT_REPLY_CONTEXT } from "@/lib/companyTalentRequests/opsContactContract";
import { asObject, type EmailJobContext, type EmailRow } from "./types";
import { readRow } from "./store";
import { isInternalRoleCandidateDecisionAvailable } from "@/lib/career/internalOpportunityDecision";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

// Subject prefixes are transport syntax, not conversational intent.
function threadSubject(value: string) {
  return value
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}
export async function loadEmailReferenceContext(ctx: EmailJobContext) {
  const { data, error } = await (ctx.admin as any)
    .from("career_email_messages")
    .select("id,subject,body_text,occurred_at,mail_type,metadata")
    .eq("talent_id", ctx.talentId)
    .eq("direction", "outbound")
    .eq("status", "sent")
    .gte("occurred_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = data as EmailRow[];
  const sameAlias = (row: EmailRow) =>
    String(asObject(row.metadata).replyTo ?? "").toLowerCase() ===
    ctx.replyAlias.toLowerCase();
  const { data: connection, error: connectionError } = await (ctx.admin as any)
    .from("career_email_messages")
    .select("metadata")
    .eq("talent_id", ctx.talentId)
    .eq("direction", "outbound")
    .eq("mail_type", "internal_connection_confirmed")
    .ilike("metadata->>replyTo", ctx.replyAlias.replace(/[\\%_]/g, "\\$&"))
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionError) throw connectionError;
  const references = rows
    .filter(
      (row) =>
        row.mail_type === "opportunity_recommendation" &&
        Object.keys(asObject(asObject(row.metadata).opportunityEmailContext))
          .length
    )
    .map((row) => ({
      row,
      rank:
        threadSubject(row.subject ?? "") === threadSubject(ctx.subject)
          ? 0
          : sameAlias(row)
            ? 1
            : 2,
    }))
    .sort((a, b) => a.rank - b.rank);
  const selected = (
    references.some((r) => r.rank === 0)
      ? references.filter((r) => r.rank === 0)
      : references
  ).slice(0, 3);
  const index = selected.map(({ row }) => {
    const meta = asObject(asObject(row.metadata).opportunityEmailContext);
    return {
      subject: row.subject,
      sentAt: row.occurred_at,
      targets: (Array.isArray(meta.targets) ? meta.targets : [])
        .slice(0, 10)
        .map((target: EmailRow) => ({
          recommendationId: target.recommendationId,
          roleId: target.roleId,
          company: target.companyName,
          role: target.roleName,
          sourceType: target.sourceType,
          contextType: target.contextType,
        })),
      careerCheckIn: meta.careerCheckIn,
    };
  });
  const meta = asObject(connection?.metadata);
  const internalConnectionReply = connection
    ? {
        recommendationId: meta.recommendationId,
        roleId: meta.roleId,
        company: meta.companyName,
        role: meta.roleName,
      }
    : null;
  let companyContact = null;
  if (ctx.companyRequestId) {
    const request = await readRow(
      ctx.admin,
      "company_talent_requests",
      ctx.companyRequestId
    );
    if (request?.talent_id === ctx.talentId)
      companyContact = {
        connectionId: request.ops_only ? `ops-contact:${request.id}` : `recommendation:${request.recommendation_id}`,
        ...(request.ops_only ? { handling: OPS_CONTACT_REPLY_CONTEXT } : {}),
        roleId: request.role_id,
        companyMessage: String(request.request_context ?? "").slice(0, 800),
      };
  }
  const pendingCompanyRequest = await pendingCompanyRequestContext(ctx);
  return {
    internalConnectionReply,
    text: `Email source references — historical context, not consent or current availability. Read shared tools for current facts. Use contact_company for candidate-authorized replies and attachments with the exact connection ID; the email thread does not authorize sharing unrelated private facts:\n${JSON.stringify({ internalConnectionReply, companyContact, opportunityEmails: index, pendingCompanyRequest })}`,
  };
}

async function pendingCompanyRequestContext(ctx: EmailJobContext) {
  if (!ctx.companyRequestId) return null;
  const request = await readRow(
    ctx.admin,
    "company_talent_requests",
    ctx.companyRequestId
  );
  if (
    !request ||
    request.talent_id !== ctx.talentId ||
    !["awaiting_talent", "closed"].includes(request.workflow_status) ||
    request.talent_source_message_id ||
    request.document_id
  )
    return null;
  const role = await readRow(
    ctx.admin,
    "company_roles",
    request.role_id,
    "role_id"
  );
  if (
    !role ||
    !isInternalRoleCandidateDecisionAvailable(role.status) ||
    role.is_expired ||
    (role.expires_at && Date.parse(role.expires_at) <= Date.now())
  )
    return null;
  const { data, error } = await (ctx.admin as any)
    .from("contact_queue")
    .select("id")
    .eq("company_talent_request_id", request.id)
    .eq("type", "company_request_candidate_delivery")
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    companyRequestId: request.id,
    careerUrl: new URL("/career", getConfiguredPublicSiteUrl()).href,
    responseReceived: false,
  };
}
