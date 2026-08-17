export type HarperSlackAccessDenialReason =
  | "email_unavailable"
  | "insufficient_role"
  | "not_member";

type HarperSlackAccessDeniedMessageArgs = {
  email?: string | null;
  hasPendingInvitation?: boolean;
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
  const workspaceName = slackCode(args.workspaceName) || "현재";
  const email = slackCode(args.email);

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
    `현재 Slack 계정${email ? ` (\`${email}\`)` : ""}은 “${workspaceName}” Harper Workspace 멤버로 등록되어 있지 않습니다.`,
    "Workspace 관리자에게 이 이메일로 초대를 요청한 뒤 다시 시도해 주세요.",
  ].join("\n");
}
