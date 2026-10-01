import type { OrgLocale } from "@/i18n/org/locale";

export type HarperSlackAccessDenialReason =
  | "email_unavailable"
  | "insufficient_role"
  | "not_member";

type HarperSlackAccessDeniedMessageArgs = {
  email?: string | null;
  hasPendingInvitation?: boolean;
  locale?: OrgLocale;
  reason: HarperSlackAccessDenialReason;
  workspaceName?: string | null;
};

const clean = (value: unknown) => String(value ?? "").trim();

function slackCode(value: unknown) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "'");
}

export function buildHarperSlackAccessDeniedMessage(
  args: HarperSlackAccessDeniedMessageArgs
) {
  const workspaceName =
    slackCode(args.workspaceName) ||
    (args.locale === "en" ? "this workspace" : "현재");
  const email = slackCode(args.email);

  if (args.locale === "en") {
    if (args.reason === "email_unavailable")
      return [
        "🔒 *Couldn't verify Harper Workspace access.*",
        `Slack didn't provide an email address, so access to “${workspaceName}” couldn't be verified.`,
        "Ask a Workspace admin to verify your Slack email and workspace access.",
      ].join("\n");
    if (args.reason === "insufficient_role")
      return [
        "🔒 *You don't have permission to use Harper here.*",
        `Your account${email ? ` (\`${email}\`)` : ""} has Viewer access to “${workspaceName}”.`,
        "Ask a Workspace Owner or Admin to update your access, then try again.",
      ].join("\n");
    if (args.hasPendingInvitation)
      return [
        "🔒 *Join the Harper Workspace to continue.*",
        `An invitation to “${workspaceName}” was sent to your Slack email${email ? ` (\`${email}\`)` : ""}.`,
        "Finish signing up from the invitation email, then try again.",
      ].join("\n");
    return [
      "🔒 *You don't have access to this Harper Workspace.*",
      `No team member account in “${workspaceName}” matches your Slack email${email ? ` (\`${email}\`)` : ""}.`,
      "Ask a Workspace admin to invite this email, then try again.",
    ].join("\n");
  }

  if (args.reason === "email_unavailable") {
    return [
      "🔒 *Harper Workspace 권한을 확인하지 못했습니다.*",
      `현재 Slack 계정의 이메일을 확인할 수 없어 “${workspaceName}” Harper Workspace 접근 권한을 검증하지 못했습니다.`,
      "Workspace 관리자에게 Slack과 동일한 이메일로 초대를 요청한 뒤 다시 시도해 주세요.",
    ].join("\n");
  }

  if (args.reason === "insufficient_role") {
    return [
      "🔒 *Harper를 호출할 권한이 없습니다.*",
      `현재 계정${email ? ` (\`${email}\`)` : ""}은 “${workspaceName}” Harper Workspace의 Viewer입니다.`,
      "Workspace Owner 또는 Admin에게 권한 변경을 요청한 뒤 다시 시도해 주세요.",
    ].join("\n");
  }

  if (args.hasPendingInvitation) {
    return [
      "🔒 *Harper Workspace 가입이 필요합니다.*",
      `현재 Slack 계정${email ? ` (\`${email}\`)` : ""}으로 “${workspaceName}” Harper Workspace 초대가 발송되어 있습니다.`,
      "초대 이메일에서 가입을 완료한 뒤 다시 시도해 주세요.",
    ].join("\n");
  }

  return [
    "🔒 *Harper Workspace 접근 권한이 없습니다.*",
    `현재 Slack 계정${email ? ` (\`${email}\`)` : ""}은 “${workspaceName}” Harper Workspace 팀원으로 등록되어 있지 않습니다.`,
    "Workspace 관리자에게 이 이메일로 초대를 요청한 뒤 다시 시도해 주세요.",
  ].join("\n");
}
