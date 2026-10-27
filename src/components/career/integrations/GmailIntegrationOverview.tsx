import Image from "next/image";
import { BriefcaseBusiness, ListChecks, LockKeyhole } from "lucide-react";
import { useCareerT } from "@/i18n/useCareerT";
import IntegrationOverview from "./IntegrationOverview";

export default function GmailIntegrationOverview(props: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const t = useCareerT();
  return (
    <IntegrationOverview
      {...props}
      content={{
        name: "Gmail",
        provider: t("career.integrations.gmail.provider", "Google 제공"),
        icon: (
          <Image src="/images/logos/gmail.svg" alt="" width={44} height={44} />
        ),
        description: t(
          "career.integrations.gmail.description",
          "Harper와 지원 후 모든 과정을 함께 하세요."
        ),
        examples: [
          {
            id: "interview",
            messages: [
              {
                role: "assistant",
                text: t(
                  "career.integrations.gmail.interview_confirmed",
                  "리멤버 인터뷰가 이번 주 금요일 오후 2시로 확정됐어요. 바로 제가 인터뷰 예상 질문들을 준비해볼까요?\n\n인터뷰 전날 오전 10시에 리마인드 드릴게요."
                ),
              },
              {
                role: "user",
                text: t(
                  "career.integrations.gmail.interview_reply",
                  "네, 준비해 주세요!"
                ),
              },
            ],
          },
          {
            id: "progress",
            messages: [
              {
                role: "user",
                text: t(
                  "career.integrations.gmail.example_progress",
                  "메일에서 확인한 전형 진행 상황을 알려 줘"
                ),
              },
              {
                role: "assistant",
                text: t(
                  "career.integrations.gmail.response_progress",
                  "당근에서 과제 안내가 왔어요. 제출 기한은 이번 주 금요일이에요. 리멤버에서는 1차 인터뷰 일정 회신을 기다리고 있고요.\n\n먼저 과제 준비부터 같이 해볼까요?"
                ),
              },
            ],
          },
          {
            id: "context",
            messages: [
              {
                role: "user",
                text: t(
                  "career.integrations.gmail.example_context",
                  "내 지원 이력을 참고해서 다음 기회를 같이 찾아보자"
                ),
              },
              {
                role: "assistant",
                text: t(
                  "career.integrations.gmail.response_context",
                  "최근에는 프로덕트 디자인 직무에 지원하셨네요. 이미 지원한 토스·당근·리멤버를 참고해서 새로운 기회를 찾아볼게요.\n\n이번에도 같은 직무를 생각하고 계세요?"
                ),
              },
            ],
          },
        ],
        features: [
          {
            id: "history",
            icon: <ListChecks className="h-5 w-5" />,
            title: t(
              "career.integrations.gmail.history_title",
              "지원 이력을 한눈에"
            ),
            description: t(
              "career.integrations.gmail.history_description",
              "최근 2년의 채용 메일에서 지원한 회사와 전형 진행 상황을 정리해요."
            ),
          },
          {
            id: "context",
            icon: <BriefcaseBusiness className="h-5 w-5" />,
            title: t(
              "career.integrations.gmail.context_title",
              "먼저 메일을 읽고 할 일을 파악"
            ),
            description: t(
              "career.integrations.gmail.context_description",
              "지원한 역할을 계속 팔로우하고, 채용 프로세스를 같이 준비해요."
            ),
          },
          {
            id: "privacy",
            icon: <LockKeyhole className="h-5 w-5" />,
            title: t(
              "career.integrations.gmail.privacy_title",
              "나와 Harper 사이에만"
            ),
            description: t(
              "career.integrations.gmail.privacy_description",
              "가져온 커리어 정보는 회사에 공개되지 않아요."
            ),
          },
        ],
        continueLabel: t(
          "career.integrations.gmail.continue",
          "Gmail 연결하기"
        ),
        pendingLabel: t(
          "career.integrations.gmail.pending",
          "연결 화면 여는 중"
        ),
      }}
    />
  );
}
