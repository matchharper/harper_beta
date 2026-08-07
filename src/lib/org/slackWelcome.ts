const DEFAULT_PUBLIC_SITE_URL = "https://matchharper.com";

function publicSiteOrigin(value: string) {
  const normalized = value.trim() || DEFAULT_PUBLIC_SITE_URL;
  const withProtocol = /^https?:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}

export function buildHarperSlackWelcomeMessage(args: {
  botUserId: string;
  publicSiteUrl: string;
  workspaceId: string;
}) {
  const harperUrl = new URL("/org", publicSiteOrigin(args.publicSiteUrl));
  harperUrl.searchParams.set("orgId", args.workspaceId);
  const harperMention = `<@${args.botUserId}>`;

  return [
    `:tada: 이 채널이 <${harperUrl.toString()}|Harper>와 연결됐어요!`,
    "",
    "이제 이곳에서 채용 진행 상황을 확인하고 Harper와 함께 후보자를 검토할 수 있어요.",
    "",
    "이 채널에서 알려드려요:",
    "• :bar_chart: 주요 채용 활동과 진행 상황",
    "• :red_circle: 확인이나 결정이 필요한 요청",
    "",
    `:bulb: 궁금한 점은 ${harperMention}를 태그해 물어보세요.`,
    `> ${harperMention} 지금 우선 검토해야 할 후보자를 알려줘`,
  ].join("\n");
}
