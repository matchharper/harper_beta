import { createOpportunityRunMarker } from "@/lib/opportunityDiscovery/messageMarker";

export function buildOnboardingInitialSearchStartedContent(args: {
  gmailConnected: boolean;
  hasUploadedResume: boolean;
  locale: "ko" | "en";
  opportunityRunId: string;
}) {
  const profileSourcesPath = "/career/profile?profileSection=links";
  const inviteProgramPath = "/career?intent=referral";
  const message =
    args.locale === "ko"
      ? [
          "인터뷰를 마쳐주셔서 감사합니다. 지금부터 말씀해주신 경험과 선호를 바탕으로 잘 맞는 기회를 찾기 시작했어요. 첫 탐색 결과는 1시간 이내에 추천된 기회와 이메일로 알려드릴게요. 화면을 닫아도 탐색은 계속됩니다.",
          "기다리는 동안 아래 내용을 확인하거나, 여기서 저와 계속 대화해도 좋아요.",
          [
            !args.gmailConnected
              ? `- [Gmail 연결하기](${profileSourcesPath}) — 최근 지원·채용 이력을 참고해 추천을 더 잘 맞출 수 있어요.`
              : null,
            !args.hasUploadedResume
              ? `- [이력서 업로드하기](${profileSourcesPath}) — 경력과 강점을 더 정확히 파악할 수 있어요.`
              : null,
            `- [초대 프로그램 확인하기](${inviteProgramPath}) — 주변 분에게 Harper를 소개하는 방법과 혜택을 확인할 수 있어요.`,
            "- **Harper와 계속 대화하기** — 새로 떠오른 조건, 관심 회사, 커리어 고민을 더 알려주세요.",
          ]
            .filter(Boolean)
            .join("\n"),
        ].join("\n\n")
      : [
          "Thanks for completing your career interview. I’m now looking for opportunities that fit the experience and preferences you shared. I’ll share your first search results within one hour in Recommended Opportunities and by email. The search will keep running if you close this page.",
          "While you wait, you can check any of the following or keep chatting with me here.",
          [
            !args.gmailConnected
              ? `- [Connect Gmail](${profileSourcesPath}) — I can use your recent application and recruiting history to improve recommendations.`
              : null,
            !args.hasUploadedResume
              ? `- [Upload your resume](${profileSourcesPath}) — It helps me understand your experience and strengths more accurately.`
              : null,
            `- [View the invite program](${inviteProgramPath}) — See how you can introduce Harper to someone in your network and learn about the benefits.`,
            "- **Keep chatting with Harper** — Share any new preferences, target companies, or career questions that come to mind.",
          ]
            .filter(Boolean)
            .join("\n"),
        ].join("\n\n");

  return `${message}\n\n${createOpportunityRunMarker(args.opportunityRunId)}`;
}
