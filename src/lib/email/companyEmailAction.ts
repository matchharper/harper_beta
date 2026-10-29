import type { OrgLocale } from "@/i18n/org/locale";
import { OrgHttpError } from "@/lib/org/httpError";
import { billingErrorCopy, WorkspaceBillingError } from "@/lib/org/billing/types";
import { EmailPermanentError } from "./runtime/types";
import {
  companyEmailActionCopy,
  type CompanyEmailActionKind,
} from "./companyEmailActionCopy";

/** What a failed confirm means for the one-time link (3단계 D, 결과 기록 표). */
export type CompanyEmailActionFailure =
  | { kind: "handled_elsewhere" }
  | { kind: "field_error"; message: string }
  | { kind: "error"; message: string };

export const COMPANY_EMAIL_ACTIONS: readonly CompanyEmailActionKind[] = [
  "request_intro",
  "pass",
  "accept_connection",
  "reject_connection",
];
export const COMPANY_EMAIL_APPEAL_MAX_LENGTH = 2_000;

export function isCompanyEmailActionKind(value: unknown): value is CompanyEmailActionKind {
  return COMPANY_EMAIL_ACTIONS.includes(value as CompanyEmailActionKind);
}

export function companyEmailActionLocale(acceptLanguage: string | null | undefined): OrgLocale {
  return /^\s*ko\b/i.test(acceptLanguage ?? "") ? "ko" : "en";
}

/** Only Request intro takes input: the interest reason the web dialog also requires. */
export function parseCompanyEmailActionInput(
  action: CompanyEmailActionKind,
  body: unknown,
  locale: OrgLocale
): { appeal: string; notifyCandidate: boolean } | { fieldError: string } {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  // Rejecting tells the candidate unless the team turned the closing note off.
  const notifyCandidate = input.notifyCandidate !== false;
  if (action !== "request_intro") return { appeal: "", notifyCandidate };
  const raw = input.appeal;
  const appeal = typeof raw === "string" ? raw.trim() : "";
  if (!appeal) return { fieldError: companyEmailActionCopy(locale).appealRequired };
  if (appeal.length > COMPANY_EMAIL_APPEAL_MAX_LENGTH)
    return {
      fieldError: locale === "ko"
        ? "관심 이유는 2,000자 이내로 적어 주세요."
        : "Keep the reason within 2,000 characters.",
    };
  return { appeal, notifyCandidate };
}

/** The server functions are the same as web and Slack; only their result is mapped.
 * `stillActionable` is the candidate state re-read after the failure. */
export function classifyCompanyEmailActionError(
  error: unknown,
  args: { action: CompanyEmailActionKind; locale: OrgLocale; stillActionable: boolean }
): CompanyEmailActionFailure {
  const copy = companyEmailActionCopy(args.locale);
  // Billing errors carry status 409 and must not look like another decision.
  if (error instanceof WorkspaceBillingError)
    return { kind: "error", message: billingErrorCopy(error.code, args.locale) };
  if (error instanceof EmailPermanentError)
    return { kind: "error", message: copy.recipientInvalid };
  if (error instanceof OrgHttpError) {
    if (error.status === 403) return { kind: "error", message: copy.noPermission };
    if (error.status === 409)
      // A refusal while the candidate is still open (paused Role, changed
      // visibility) keeps the server's own message and the link stays usable.
      return args.stillActionable
        ? { kind: "error", message: error.message }
        : { kind: "handled_elsewhere" };
    if (error.status === 400 && args.action === "request_intro")
      return { kind: "field_error", message: error.message };
    if (error.status >= 400 && error.status < 500)
      return { kind: "error", message: error.message };
  }
  // pass_company_intro_v1 raises this when the proposal already left `ready`.
  if (!args.stillActionable && error instanceof Object &&
      String((error as { message?: unknown }).message ?? "").includes("company_intro_not_passable"))
    return { kind: "handled_elsewhere" };
  return { kind: "error", message: copy.unknown };
}

const CLOSING_STAGE_BY_TAG: Record<string, string> = {
  "내부:연결됨": "connected",
  "내부:최종오퍼": "already_in_pipeline",
  "내부:프로세스중단": "process_stopped",
  "내부:거절": "process_stopped",
  "내부:아카이브": "archived",
};

/** Ready to connect stays open only while the pair has the pending tag and no
 * later stage, the same tag rule as company_first_outbox_is_deliverable_v1. */
export function acceptedConnectionStatusFromTags(tags: string[]) {
  const closing = tags.find((tag) => CLOSING_STAGE_BY_TAG[tag] || tag.startsWith("내부단계:"));
  if (closing)
    return { actionable: false, status: CLOSING_STAGE_BY_TAG[closing] ?? "already_in_pipeline" };
  return tags.includes("내부:연결대기")
    ? { actionable: true, status: "pending_connection" }
    : { actionable: false, status: "unavailable" };
}
