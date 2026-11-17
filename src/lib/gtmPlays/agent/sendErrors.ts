/**
 * #5: what a failed mail provider call (Resend, through src/lib/email/send.ts) means for the agent. Pure.
 *
 *   recipient  this mail cannot go to this address (an invalid `to`, a mail the provider rejects as such): the
 *              person stops here (failed), the others go on.
 *   refused    the provider refused it for a reason that is not the person's (an API key, an unverified sending
 *              domain or sender, a quota or rate limit): sending stops for this tick, the person stays approved and
 *              the next tick tries again with a new mail row (a refusal is never a mail that went out).
 *   unknown    no answer, or a server error: the provider may have accepted it. Sending stops for this tick, the
 *              mail row stays "sending" and the next tick asks again with the same idempotency key, so a mail that
 *              did go out is recorded as sent and never goes out twice.
 */

export type SendErrorKind = "recipient" | "refused" | "unknown";

export type SendErrorClass = { kind: SendErrorKind; status: number | null; reason: string };

const NETWORK = /fetch failed|network|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR|terminated|timed? ?out|timeout|aborted/i;

/** The HTTP status and the provider's error name/message in send.ts's "Failed to send email: HTTP 422 {...}". */
function providerAnswer(message: string): { status: number | null; name: string; detail: string } {
  const match = /HTTP (\d{3})\s*([\s\S]*)$/.exec(message);
  if (!match) return { status: null, name: "", detail: "" };
  let name = "";
  let detail = match[2] ?? "";
  try {
    const body = JSON.parse(match[2]) as { name?: unknown; message?: unknown };
    name = typeof body.name === "string" ? body.name : "";
    detail = typeof body.message === "string" ? body.message : detail;
  } catch {
    // Not JSON: the raw text is the detail.
  }
  return { status: Number(match[1]), name, detail };
}

/** A validation error about the recipient field (the address itself), not about the sender or the account. */
const aboutRecipient = (name: string, detail: string) =>
  /invalid_to_address/i.test(name) || /`to`|\bto field\b|recipient|to_address/i.test(detail);

const short = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 200);

export function classifySendError(error: unknown): SendErrorClass {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const errorName = error instanceof Error ? error.name : "";
  const { status, name, detail } = providerAnswer(message);
  const what = short(detail || name || message) || "알 수 없는 오류";
  if (status === null) {
    if (/RESEND_API_KEY/.test(message)) return { kind: "refused", status, reason: "메일 서비스 키가 설정되지 않았어요" };
    // No answer (a timeout, a dropped connection) or anything else before an answer: it may have gone out.
    const timeout = errorName === "TimeoutError" || errorName === "AbortError" || /timeout|timed out|aborted/i.test(message);
    return { kind: "unknown", status, reason: timeout ? "메일 서비스가 제때 답하지 않았어요" : NETWORK.test(message) ? `메일 서비스에 닿지 못했어요 · ${what}` : `메일 서비스 오류 · ${what}` };
  }
  if (status >= 500) return { kind: "unknown", status, reason: `메일 서비스 서버 오류 (${status})` };
  if (status === 429) return { kind: "refused", status, reason: `메일 서비스 한도에 걸렸어요 (429 · ${what})` };
  if (status === 401 || status === 403) return { kind: "refused", status, reason: `보내는 설정을 메일 서비스가 받지 않았어요 (${status} · ${what})` };
  if (status === 409) {
    // The same key in flight elsewhere: its outcome is not known yet. A different mail under the same key: this mail's.
    return /concurrent/i.test(name) || /in progress|concurrent/i.test(detail)
      ? { kind: "unknown", status, reason: "같은 메일을 보내는 중이에요" }
      : { kind: "recipient", status, reason: `메일 서비스가 이 메일을 받지 않았어요 (409 · ${what})` };
  }
  if (status === 422 || status === 400) {
    return aboutRecipient(name, detail)
      ? { kind: "recipient", status, reason: `받는 주소를 메일 서비스가 받지 않았어요 (${status} · ${what})` }
      : status === 422
        ? { kind: "refused", status, reason: `보내는 설정을 메일 서비스가 받지 않았어요 (${status} · ${what})` }
        : { kind: "recipient", status, reason: `메일 서비스가 이 메일을 받지 않았어요 (${status} · ${what})` };
  }
  // 404 / 405 / 451 and the rest: the account or the endpoint, not the person.
  return { kind: "refused", status, reason: `메일 서비스가 받지 않았어요 (${status} · ${what})` };
}

/** Thrown by the agent's send (send.server.ts) after a provider call failed, with what it means. */
export class AgentSendError extends Error {
  readonly kind: SendErrorKind;
  readonly status: number | null;
  readonly mailId: string | null;
  constructor(info: SendErrorClass, mailId: string | null) {
    super(info.reason);
    this.name = "AgentSendError";
    this.kind = info.kind;
    this.status = info.status;
    this.mailId = mailId;
  }
}

/** Resend keeps an idempotency key 24 hours: a mail stuck mid-send is asked again with its key only before this. */
export const IDEMPOTENCY_WINDOW_MS = 23 * 3_600_000;
