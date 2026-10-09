import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  fetchTalentDocuments,
  fetchTalentDocument,
} from "@/lib/talentOnboarding/documentStore";
import {
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";
import {
  parseApplicationStartOffer,
  type ApplicationStartOffer,
} from "./startOffer";
import type { Json } from "@/types/database.types";
export async function createApplicationStartOffer(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  replyId?: number;
  roleName: string;
  roleTitle?: string;
  companyName?: string;
  companyLogoUrl?: string | null;
  roleId?: string;
  official_job_slug?: string;
}) {
  if (args.replyId) {
    const { data, error } = await args.admin
      .from("talent_messages")
      .select("*")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .eq("message_type", "application_start_offer")
      .contains("payload", { replyId: args.replyId })
      .maybeSingle();
    if (error) throw new Error("Could not check existing start card");
    if (data) return toTalentMessageResponse(data as TalentMessageRow);
  }
  const resumes = await fetchTalentDocuments({
    admin: args.admin,
    userId: args.userId,
    kind: "resume",
  });
  const payload: ApplicationStartOffer = {
    version: 1,
    replyId: args.replyId,
    status: "ready",
    roleName: args.roleName,
    roleTitle: args.roleTitle,
    companyName: args.companyName,
    companyLogoUrl: args.companyLogoUrl,
    ...(args.official_job_slug
      ? { official_job_slug: args.official_job_slug }
      : { roleId: args.roleId }),
    resumes: resumes.map((d) => ({
      id: d.id,
      name: d.file_name,
      primary: !!d.is_primary,
    })),
  };
  const { data, error } = await args.admin
    .from("talent_messages")
    .insert({
      user_id: args.userId,
      conversation_id: args.conversationId,
      role: "assistant",
      message_type: "application_start_offer",
      content: args.roleName,
      payload: payload as unknown as Json,
    })
    .select("*")
    .single();
  if (error || !data)
    throw new Error("Unable to prepare application start card");
  return toTalentMessageResponse(data as TalentMessageRow);
}
export async function claimApplicationStartOffer(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  messageId: number;
  documentId: string | null;
}) {
  const { data, error } = await args.admin
    .from("talent_messages")
    .select("*")
    .eq("id", args.messageId)
    .eq("user_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .eq("message_type", "application_start_offer")
    .single();
  const offer = parseApplicationStartOffer(data?.payload);
  if (error || !offer || offer.status !== "ready")
    throw new Error("This start card is no longer available.");
  if (!args.documentId) throw new Error("Select a resume before starting.");
  if (args.documentId) {
    const document = await fetchTalentDocument({
      admin: args.admin,
      userId: args.userId,
      documentId: args.documentId,
    });
    if (
      !document ||
      document.kind !== "resume" ||
      !document.extracted_text?.trim()
    )
      throw new Error(
        "The selected resume is unavailable or not readable yet."
      );
  }
  return {
    message: toTalentMessageResponse(data as TalentMessageRow),
    input: {
      ...(offer.official_job_slug
        ? { official_job_slug: offer.official_job_slug }
        : { roleId: offer.roleId }),
      ...(args.documentId
        ? { document_id: args.documentId }
        : { profile_only: true }),
    },
    roleName: offer.roleName,
  };
}

export async function prepareApplicationStartPayload(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  replyId: number;
  request: import("./startOfferPayload").StartOfferPayload;
}) {
  // Shared data readers perform the same visibility checks as role-context lookup.
  if ("official_job_slug" in args.request) {
    const { getPublicOfficialJobBySlug } =
      await import("@/lib/officialJobs/server");
    const job = await getPublicOfficialJobBySlug(
      args.request.official_job_slug
    );
    if (!job) throw new Error("Role unavailable");
    return createApplicationStartOffer({
      ...args,
      ...args.request,
      roleName: `${job.companyName} · ${job.roleTitle}`,
      roleTitle: job.roleTitle,
      companyName: job.companyName,
      companyLogoUrl: job.companyLogoUrl,
    });
  }
  const { runGetRoleContext } = await import("@/lib/talentOnboarding/tools");
  const lookup = await runGetRoleContext({
    admin: args.admin,
    userId: args.userId,
    roleIds: [args.request.roleId],
    includeJd: false,
    activityOffset: 0,
  });
  const item = lookup.roles[0];
  if (!item?.found || !item.role) throw new Error("Role unavailable");
  return createApplicationStartOffer({
    ...args,
    ...args.request,
    roleName: [item.companyDb?.name, item.role.name]
      .filter(Boolean)
      .join(" · "),
    roleTitle: item.role.name ?? undefined,
    companyName: item.companyDb?.name ?? undefined,
    companyLogoUrl: item.companyDb?.logoUrl ?? null,
  });
}
