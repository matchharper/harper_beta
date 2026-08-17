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
  description: string;
  descriptionOrigin:
    | "company_style_draft"
    | "same_company_public_jd"
    | "user_supplied";
  descriptionSourceUrl?: string | null;
  roleTitle: string;
  webUrl: string;
}) {
  const description = escapeSlackText(args.description).slice(0, 1_200);
  const title = escapeSlackText(args.roleTitle);
  const descriptionLabel =
    args.descriptionOrigin === "user_supplied"
      ? "지금까지 알려주신 내용"
      : args.descriptionOrigin === "same_company_public_jd"
        ? "공개 JD를 참고해 Harper가 정리한 초안"
        : "회사 정보와 기존 공고 형식을 참고해 Harper가 만든 초안";
  const sourceLine =
    text(args.descriptionSourceUrl)
      ? `<${text(args.descriptionSourceUrl)}|참고한 공개 JD>`
      : "";
  const correctionLine =
    args.descriptionOrigin === "user_supplied"
      ? "이 메시지의 스레드에 JD, 링크, 파일이나 생각해둔 내용을 편하게 보내 주세요. 제가 역할 설명과 팀에서 중요하게 보는 인재 기준을 정리하고, 등록 전에 다시 보여드릴게요."
      : "먼저 초안을 적어뒀어요. 방향이 맞는지 봐주시고, 다르게 원하시면 이 스레드에 JD 링크·파일·텍스트를 보내거나 고칠 부분만 편하게 알려 주세요.";
  return [
    "🆕 *새 역할을 같이 정리해볼게요*",
    "",
    `*역할*  ${title}`,
    `*${descriptionLabel}*  ${description}`,
    ...(sourceLine ? [sourceLine] : []),
    "",
    correctionLine,
    "",
    `Slack보다 웹이 편하면 <${args.webUrl}|웹에서 계속 작성하기>를 이용하셔도 돼요.`,
  ].join("\n");
}

export function buildSlackRoleCreationThreadIntro(args?: {
  descriptionOrigin?:
    | "company_style_draft"
    | "same_company_public_jd"
    | "user_supplied";
}) {
  if (args?.descriptionOrigin && args.descriptionOrigin !== "user_supplied") {
    return [
      "👋 위에는 제가 먼저 정리한 역할 설명 초안이 있어요.",
      "방향이 맞는지 알려주시거나, 다르게 원하시면 JD 링크·파일·텍스트 또는 고칠 부분을 편하게 보내 주세요.",
    ].join("\n");
  }
  return [
    "👋 생각해둔 내용을 편하게 전부 적거나 JD를 보내 주세요.",
    "빠진 부분은 제가 필요한 것만 여쭤볼게요.",
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
        `🧵 <${role.threadPermalink}|${role.roleTitle} 역할 작성 스레드로 이동>`
    )
    .join("\n")}`;
}
