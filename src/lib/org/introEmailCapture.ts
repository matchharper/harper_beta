import { createReplyToken } from "@/lib/email/security";

const DEFAULT_EMAIL_REPLY_DOMAIN = "reply.matchharper.com";

type OrgIntroCaptureAdmin = {
  from: (table: string) => any;
};

type OrgIntroCaptureThreadRow = {
  capture_address: string;
  id: string;
};

function getEmailReplyDomain() {
  return (
    process.env.EMAIL_REPLY_DOMAIN?.trim() || DEFAULT_EMAIL_REPLY_DOMAIN
  ).toLowerCase();
}

async function fetchExistingThread(
  admin: OrgIntroCaptureAdmin,
  outboundMessageId: string
) {
  const { data, error } = await admin
    .from("org_intro_email_threads")
    .select("id, capture_address")
    .eq("outbound_message_id", outboundMessageId)
    .maybeSingle();

  if (error) throw error;
  return data as OrgIntroCaptureThreadRow | null;
}

export async function getOrCreateOrgIntroCaptureThread(args: {
  admin: OrgIntroCaptureAdmin;
  outboundMessageId: string;
  participantEmails: string[];
  recommendationId: string;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const existing = await fetchExistingThread(
    args.admin,
    args.outboundMessageId
  );
  if (existing) {
    return {
      address: existing.capture_address,
      threadId: existing.id,
    };
  }

  const domain = getEmailReplyDomain();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createReplyToken();
    const address = `intro+${token}@${domain}`;
    const { data, error } = await args.admin
      .from("org_intro_email_threads")
      .insert({
        capture_address: address,
        company_workspace_id: args.workspaceId,
        outbound_message_id: args.outboundMessageId,
        participant_emails: args.participantEmails,
        recommendation_id: args.recommendationId,
        role_id: args.roleId,
        talent_id: args.talentId,
      })
      .select("id, capture_address")
      .single();

    if (!error && data) {
      const inserted = data as OrgIntroCaptureThreadRow;
      return {
        address: inserted.capture_address,
        threadId: inserted.id,
      };
    }

    if (error?.code === "23505") {
      const raced = await fetchExistingThread(
        args.admin,
        args.outboundMessageId
      );
      if (raced) {
        return {
          address: raced.capture_address,
          threadId: raced.id,
        };
      }
      continue;
    }

    throw error ?? new Error("Failed to create org intro capture thread");
  }

  throw new Error("Failed to allocate a unique org intro capture address");
}
