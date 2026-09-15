type InitialSearchStartedEmailLocale = "en" | "ko";

function normalizeBaseUrl(value?: string | null) {
  const raw = (
    value?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "https://matchharper.com"
  ).replace(/\/+$/, "");
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function buildSalutation(args: {
  locale: InitialSearchStartedEmailLocale;
  name?: string | null;
}) {
  const name = String(args.name ?? "").trim();
  if (args.locale === "ko") {
    return name ? `${name}님, 안녕하세요!` : "안녕하세요!";
  }
  return name ? `Hi ${name},` : "Hi there,";
}

export function buildInitialSearchStartedEmail(args: {
  baseUrl?: string | null;
  gmailConnected?: boolean;
  hasUploadedResume: boolean;
  locale: InitialSearchStartedEmailLocale;
  name?: string | null;
}) {
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const chatUrl = `${baseUrl}/career?start=chat`;
  const profileSourcesUrl = `${baseUrl}/career/profile?profileSection=links`;
  const inviteProgramUrl = `${baseUrl}/career?intent=referral`;
  const salutation = buildSalutation(args);

  if (args.locale === "ko") {
    const waitingItems = [
      !args.gmailConnected
        ? `- [Gmail 연결하기](${profileSourcesUrl}) : 최근 지원·채용 이력을 Harper가 참고할 수 있게 됩니다.`
        : null,
      !args.hasUploadedResume
        ? `- [이력서 업로드하기](${profileSourcesUrl}) : 경력과 강점을 더 정확히 이해해 기회를 살펴볼 수 있어요.`
        : null,
      `- [Harper 초대 프로그램](${inviteProgramUrl})`,
      `- [Harper와 계속 대화하기](${chatUrl}) : 추가적인 조건, 최근에 지원한 회사들, 커리어 고민을 더 알려주세요.`,
    ].filter(Boolean);

    return {
      body: [
        salutation,
        "Harper에게 경험을 공유해주셔서 감사합니다.",
        "이제 말씀해주신 경험과 선호를 바탕으로 보시면 좋을 만한 기회를 찾아볼게요.",
        "제가 직접 연결할 수 있는 회사에 잘 맞는 기회가 있다면 바로 연결 과정까지 도와드리고, 그렇지 않더라도 현재 채용 시장을 살펴 직접 지원해볼 만한 공개 포지션을 찾아드릴게요. 앞으로도 기회를 발견하고 비교하는 일부터 지원과 회사와의 대화를 준비하는 과정까지 커리어 여정 전반을 함께하겠습니다.",
        "첫 탐색 결과는 1시간 이내에 이메일과 Harper의 추천된 기회에서 알려드릴게요. 화면을 닫아도 탐색은 계속됩니다.",
        [
          "기다리시는 동안 아래도 한번 가볍게 확인해주세요.",
          "",
          ...waitingItems,
        ].join("\n"),
        "P.S. Harper의 이메일에 답장해서 대화를 이어나갈 수 있어요!",
      ].join("\n\n"),
      subject: "Harper가 첫 기회를 찾기 시작했어요",
    };
  }

  const waitingItems = [
    !args.gmailConnected
      ? `- [Connect Gmail](${profileSourcesUrl}) — I can use your recent application and recruiting history to reduce duplicate or irrelevant recommendations.`
      : null,
    !args.hasUploadedResume
      ? `- [Upload your resume](${profileSourcesUrl}) — It helps me understand your experience and strengths more accurately as I review opportunities.`
      : null,
    `- [View the invite program](${inviteProgramUrl}) — See how you can introduce Harper to someone in your network and learn about the benefits.`,
    `- [Keep chatting with Harper](${chatUrl}) — Share any new preferences, target companies, or career questions that come to mind.`,
  ].filter(Boolean);

  return {
    body: [
      salutation,
      "Thanks for completing your 5-minute career interview.",
      "I’ll now look for opportunities that fit the experience and preferences you shared.",
      "When there’s a strong-fit opportunity at a company I can connect you with, I’ll help move the introduction forward right away. Even when there isn’t one, I’ll search the current hiring market for public roles you can apply to directly. I’ll also support the broader journey—from discovering and comparing opportunities to preparing applications and company conversations.",
      "I’ll share your first search results within one hour by email and in Recommended Opportunities in Harper. You can close the page; the search will keep running.",
      [
        "While you wait, any of these can help me support you better:",
        "",
        ...waitingItems,
      ].join("\n"),
      "P.S. You can also reply directly to this email to keep talking with Harper!",
    ].join("\n\n"),
    subject: "Harper has started your first opportunity search",
  };
}
