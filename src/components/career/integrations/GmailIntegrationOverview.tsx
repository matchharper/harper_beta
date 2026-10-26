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
          "채용 메일 속 지원 이력을 Harper와 함께 정리하세요."
        ),
        examples: [
          {
            id: "applications",
            text: t(
              "career.integrations.gmail.example_applications",
              "내가 어떤 회사에 지원했는지 정리해 줘"
            ),
            response: t(
              "career.integrations.gmail.response_applications",
              "최근 메일에서 확인한 지원 이력이에요.\n\n• 토스 · 프로덕트 디자이너 — 서류 검토 중\n• 당근 · 프로덕트 디자이너 — 과제 안내\n• 리멤버 · UX 디자이너 — 1차 인터뷰 안내"
            ),
          },
          {
            id: "progress",
            text: t(
              "career.integrations.gmail.example_progress",
              "메일에서 확인한 전형 진행 상황을 알려 줘"
            ),
            response: t(
              "career.integrations.gmail.response_progress",
              "당근에서 과제 안내가 왔어요. 제출 기한은 이번 주 금요일이에요. 리멤버에서는 1차 인터뷰 일정 회신을 기다리고 있고요.\n\n먼저 과제 준비부터 같이 해볼까요?"
            ),
          },
          {
            id: "context",
            text: t(
              "career.integrations.gmail.example_context",
              "내 지원 이력을 참고해서 다음 기회를 같이 찾아보자"
            ),
            response: t(
              "career.integrations.gmail.response_context",
              "최근에는 프로덕트 디자인 직무에 지원하셨네요. 이미 지원한 토스·당근·리멤버를 참고해서 새로운 기회를 찾아볼게요.\n\n이번에도 같은 직무를 생각하고 계세요?"
            ),
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
              "나를 더 잘 이해하는 Harper"
            ),
            description: t(
              "career.integrations.gmail.context_description",
              "이미 지원한 기회를 다시 추천하지 않도록 지원 이력을 참고해요."
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
