import {
  BILLING_SUPPORT_HREF,
  billingErrorCopy,
  type BillingActionNotice,
} from "./types";

/** Read only the server-authored display contract, including after a retry. */
export function readBillingActionNotice(
  metadata: unknown
): BillingActionNotice | null {
  if (!metadata || typeof metadata !== "object") return null;
  const notice = (metadata as Record<string, unknown>).billingNotice;
  return notice &&
    typeof notice === "object" &&
    (notice as Record<string, unknown>).code === "credits_exhausted"
    ? { code: "credits_exhausted" }
    : null;
}

export function billingActionNoticeView(
  notice: BillingActionNotice,
  locale: "ko" | "en"
) {
  return {
    message: billingErrorCopy(notice.code, locale),
    label: locale === "ko" ? "Harper 팀에 문의" : "Contact Harper",
    href: BILLING_SUPPORT_HREF,
  };
}

/** Appended only at Slack delivery, never to persisted assistant content. */
export function billingActionNoticeSlack(
  notice: BillingActionNotice,
  locale: "ko" | "en"
) {
  const view = billingActionNoticeView(notice, locale);
  const text = `${view.message}\n<${view.href}|${view.label}>`;
  return {
    text,
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  };
}
