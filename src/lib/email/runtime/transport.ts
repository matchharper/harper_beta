import { resendApiUrl } from "@/lib/email/transport";
import { sendResendEmail } from "@/lib/email/send";
import { normalizeEmailAddress } from "@/lib/email/parse";
import {
  EmailPermanentError,
  asObject,
  type EmailAttachment,
  type ReceivedEmail,
} from "./types";

async function receive(path: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is required");
  const response = await fetch(resendApiUrl(path), {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404 || response.status === 410)
    throw new EmailPermanentError("Received email is no longer available");
  if (!response.ok) throw new Error(`Resend receiving HTTP ${response.status}`);
  return response.json();
}
export function normalizeAttachments(items: unknown): EmailAttachment[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 10).map((v) => {
    const a = asObject(v);
    return {
      id: String(a.id ?? a.attachment_id ?? ""),
      filename: String(a.filename ?? a.file_name ?? a.name ?? ""),
      contentType: String(
        a.content_type ?? a.contentType ?? "application/octet-stream"
      ),
      size: Number.isFinite(Number(a.size)) ? Number(a.size) : null,
      downloadUrl: String(a.download_url ?? a.downloadUrl ?? a.url ?? ""),
    };
  });
}
export async function getReceivedEmail(id: string): Promise<ReceivedEmail> {
  const email = asObject(
    await receive(`/emails/receiving/${encodeURIComponent(id)}`)
  );
  return { ...email, attachments: normalizeAttachments(email.attachments) };
}
export async function getReceivedAttachments(id: string) {
  const result = await receive(
    `/emails/receiving/${encodeURIComponent(id)}/attachments`
  );
  return normalizeAttachments(
    Array.isArray(result) ? result : (result.data ?? result.attachments)
  );
}
export function getHeader(headers: unknown, name: string): string {
  if (Array.isArray(headers)) {
    const h = headers.find(
      (v) => String(v.name ?? "").toLowerCase() === name.toLowerCase()
    );
    return String(h?.value ?? "");
  }
  const item = Object.entries(asObject(headers)).find(
    ([key]) => key.toLowerCase() === name.toLowerCase()
  );
  return item ? String(item[1]) : "";
}
export function automaticEmailReason(email: ReceivedEmail, ownAddress: string) {
  const sender = normalizeEmailAddress(String(email.from ?? ""));
  if (sender && sender === normalizeEmailAddress(ownAddress))
    return "own_sender";
  const autoSubmitted = getHeader(
    email.headers,
    "Auto-Submitted"
  ).toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return "auto_submitted";
  if (
    ["bulk", "junk", "list"].includes(
      getHeader(email.headers, "Precedence").toLowerCase()
    )
  )
    return "automated_precedence";
  if (
    getHeader(email.headers, "X-Autoreply") ||
    getHeader(email.headers, "X-Autorespond")
  )
    return "auto_reply";
  return null;
}
export function replyHeaders(email: ReceivedEmail, fallbackMessageId: string) {
  const id = String(email.message_id ?? fallbackMessageId ?? "").trim();
  const existing = getHeader(email.headers, "References")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const references = [...new Set([...existing, ...(id ? [id] : [])])]
    .slice(-50)
    .join(" ");
  return {
    ...(id ? { "In-Reply-To": id } : {}),
    ...(references ? { References: references } : {}),
  };
}
export type EmailDelivery = Parameters<typeof sendResendEmail>[0];
export async function deliverEmail(delivery: EmailDelivery) {
  const result = await sendResendEmail(delivery);
  if (!result.id) throw new Error("Resend send succeeded without a message ID");
  return result.id;
}
