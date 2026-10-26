function text(value: unknown) {
  return String(value ?? "").trim();
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
        `<${role.threadPermalink}|${role.roleTitle} 역할 등록 이어가기>`
    )
    .join("\n")}`;
}
