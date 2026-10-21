import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type Notice = {
  workspaceId: string;
  companyName: string;
  email: string | null;
  emailDomain: string | null;
  reviewDomain: string | null;
  isReviewing: boolean;
  claimedAt: string;
  status: string;
};
const slackText = (value: string | null) =>
  (value ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function signupNotificationText(notice: Notice) {
  return [
    "*새 회사 Workspace 가입*",
    `회사: ${slackText(notice.companyName)}`,
    `가입 이메일: ${slackText(notice.email)}`,
    `이메일 도메인: ${slackText(notice.emailDomain)}`,
    `이용 상태: ${notice.isReviewing ? "검토 필요 · 이용 제한" : "일반 가입"}`,
    ...(notice.reviewDomain ? [`검토 대상 도메인: ${slackText(notice.reviewDomain)}`] : []),
    `Workspace ID: ${notice.workspaceId}`,
  ].join("\n");
}

export async function deliverWorkspaceSignupNotification(
  workspaceId: string,
  dependencies = { admin: getSupabaseAdmin(), fetch }
) {
  const webhook = process.env.SLACK_COMPANY_NOTIFICATION_TOKEN;
  if (!webhook) throw new Error("SLACK_COMPANY_NOTIFICATION_TOKEN is not configured");
  const { admin } = dependencies;
  const { data, error } = await (admin.rpc as any)(
    "claim_workspace_signup_notification_v1", { p_workspace: workspaceId }
  );
  if (error) throw error;
  if (!data) return "skipped";
  const notice = data as Notice;
  let status = "uncertain";
  let deliveryError: string | undefined;
  try {
    const response = await dependencies.fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: signupNotificationText(notice) }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    if (response.ok && body.trim() === "ok") status = "sent";
    // A rate-limit rejection is safe to retry. Other responses need inspection.
    else if (response.status === 429) status = "pending";
    else deliveryError = `slack_http_${response.status}`;
  } catch {
    // Webhooks have no exactly-once receipt API. Never resend a timeout blindly.
    deliveryError = "delivery_unconfirmed";
  }
  const patch = {
    ...notice, status,
    ...(status === "sent" ? { sentAt: new Date().toISOString() } : {}),
    ...(status === "pending" ? { retryAt: new Date(Date.now() + 5 * 60_000).toISOString() } : {}),
    ...(deliveryError ? { error: deliveryError } : {}),
  };
  const { error: saveError } = await (admin.from("company_workspace") as any)
    .update({ signup_notification: patch })
    .eq("company_workspace_id", workspaceId)
    .eq("signup_notification->>claimedAt", notice.claimedAt)
    .eq("signup_notification->>status", "sending");
  if (saveError) throw saveError;
  if (status === "uncertain") console.error("[org/signup-notification] delivery requires reconciliation", workspaceId);
  return status;
}

export async function dispatchWorkspaceSignupNotifications() {
  const admin = getSupabaseAdmin();
  const { data, error } = await (admin.from("company_workspace") as any)
    .select("company_workspace_id")
    .eq("signup_notification->>status", "pending")
    .or(`signup_notification->>retryAt.is.null,signup_notification->>retryAt.lte.${new Date().toISOString()}`)
    .order("created_at")
    .limit(5);
  if (error) throw error;
  const results = await Promise.allSettled((data ?? []).map((row: { company_workspace_id: string }) =>
    deliverWorkspaceSignupNotification(row.company_workspace_id, { admin, fetch })
  ));
  for (const result of results) if (result.status === "rejected") {
    console.error("[org/signup-notification:retry]", result.reason instanceof Error ? result.reason.message : "failed");
  }
  return results.filter(result => result.status === "fulfilled" && result.value === "sent").length;
}

export async function notifyWorkspaceSignupSafely(workspaceId: string) {
  try {
    await deliverWorkspaceSignupNotification(workspaceId);
  } catch (error) {
    console.error("[org/signup-notification]", workspaceId, error instanceof Error ? error.message : "failed");
  }
}
