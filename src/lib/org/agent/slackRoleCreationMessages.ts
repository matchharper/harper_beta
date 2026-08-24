function text(value: unknown) {
  return String(value ?? "").trim();
}

function escapeSlackText(value: unknown) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildSlackRoleCreationWebUrl(args: {
  publicSiteUrl: string;
  roleId: string;
  workspaceId: string;
}) {
  const url = new URL("/org/role", args.publicSiteUrl);
  url.searchParams.set("orgId", args.workspaceId);
  url.searchParams.set("roleId", args.roleId);
  return url.toString();
}

export function buildSlackRoleCreationStartMessage(args: {
  roleTitle: string;
  webUrl: string;
}) {
  const title = escapeSlackText(args.roleTitle);
  return [
    `*${title} 역할 작성을 시작했어요*`,
    "",
    "방금 대화에서 받은 내용을 이 스레드로 옮겼어요. 아직 초안이며, Harper가 역할 설명과 팀에서 중요하게 보는 기준을 정리하고 있어요.",
    "",
    `이 스레드에서 정보를 더 보내거나 <${args.webUrl}|웹에서 계속 작성하기>를 선택할 수 있어요.`,
  ].join("\n");
}

export function appendMissingSlackRoleCreationThreadLinks(args: {
  message: string;
  roles: Array<{ roleTitle: string; threadPermalink: string }>;
}) {
  const message = text(args.message);
  if (!message) return message;
  const missing = args.roles.filter(
    (role) =>
      message.includes(role.roleTitle) &&
      !message.includes(role.threadPermalink)
  );
  if (missing.length === 0) return message;
  return `${message}\n\n${missing
    .map(
      (role) =>
        `<${role.threadPermalink}|${role.roleTitle} 역할 작성 스레드로 이동>`
    )
    .join("\n")}`;
}
