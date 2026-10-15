import { TOOL_RUNTIME_CONTROL } from "@/lib/llm/toolError";
import type {
  TalentAdminClient,
  TalentMessageRow,
} from "@/lib/talentOnboarding/server";

export type EmailRuntimeKind = "reply" | "contact" | "onboarding_review";
export type EmailRuntimeMessage = {
  version: 1;
  kind: EmailRuntimeKind;
  jobId: string;
};
export type EmailRow = Record<string, any>;
export type EmailAdmin = TalentAdminClient;
export type EmailAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number | null;
  downloadUrl: string;
};
export type ReceivedEmail = EmailRow & { attachments?: EmailAttachment[] };
export type EmailJobContext = {
  admin: EmailAdmin;
  job: EmailRow;
  owner: string;
  inbound: EmailRow;
  received: ReceivedEmail;
  body: string;
  thread: string;
  sender: string;
  subject: string;
  recipients: string[];
  attachments: EmailAttachment[];
  talentId: string;
  conversationId: string;
  replyAlias: string;
  companyRequestId: string | null;
  sourceMessage: TalentMessageRow;
};

export class EmailPermanentError extends Error {}
export class EmailBusyError extends Error { readonly [TOOL_RUNTIME_CONTROL] = true; }
// Durable work yielded normally; retry promptly without consuming failure attempts.
export class EmailContinuationPending extends EmailBusyError {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseEmailRuntimeMessage(
  value: unknown
): EmailRuntimeMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    v.version !== 1 ||
    typeof v.jobId !== "string" ||
    !UUID.test(v.jobId) ||
    !["reply", "contact", "onboarding_review"].includes(String(v.kind))
  )
    return null;
  return { version: 1, kind: v.kind as EmailRuntimeKind, jobId: v.jobId };
}

export function emailRuntimeEnabled() {
  return process.env.EMAIL_RUNTIME_TARGET === "vercel_queue";
}
export function emailRuntimeTable(kind: EmailRuntimeKind) {
  return kind === "reply"
    ? "email_reply_jobs"
    : kind === "contact"
      ? "contact_queue"
      : "career_email_onboarding_leads";
}
export function asObject(value: unknown): EmailRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
export function nowIso() {
  return new Date().toISOString();
}
