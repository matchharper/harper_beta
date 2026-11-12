// career-i18n-skip-file: Developer gallery with synthetic data and local-only actions.
import { useState } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { BrowserPreviewSurface } from "./BrowserPreviewFrame";
import CareerGlassDevControls from "./CareerGlassDevControls";
import { GmailIntegrationActionContent } from "./chat/GmailIntegrationAction";
import { CareerFormView } from "./chat/CareerFormCard";
import CareerCallProposalCard from "./chat/CareerCallProposalCard";
import { PreviewUI } from "./chat/elements/DocumentPreviewCards";
import { ThinkingLogPanel } from "./chat/elements/ThinkingLogPanel";
import { FollowButton } from "./watchlist/FollowButton";
import OpportunityStatusDropdown from "./history/OpportunityStatusDropdown";
import type { CareerOpportunityManagementStatus } from "./history/savedOpportunityStatus";
import type { CareerForm, CareerFormResponse } from "@/lib/career/forms/schema";

const ChatPreview = dynamic(
  () => import("./preview/CareerChatUiPreviewContent")
);
const SearchPreview = dynamic(() =>
  import("./CareerRecommendationSearchPreview").then(
    (module) => module.CareerRecommendationSearchPreviewContent
  )
);
const tabs = [
  "채팅 · 기회 · 조건",
  "폼 · 제안 · 문서",
  "추천 검색",
  "브라우저 · 지원",
  "Gmail · 회사 · 상태",
  "Glass",
] as const;
type PreviewTab = (typeof tabs)[number];
const form: CareerForm = {
  formId: -101,
  revision: 1,
  kind: "form",
  title: "지원 전에 확인할 내용",
  items: [
    {
      id: "work",
      type: "select",
      label: "희망 근무 방식",
      content: { options: ["대면", "하이브리드", "원격"] },
    },
    { id: "start", type: "text", label: "입사 가능 시점", content: {} },
    { id: "note", type: "textarea", label: "회사에 전할 내용", content: {} },
  ],
  positive: { id: "send", label: "답변 보내기", message: "답변을 확인해 줘." },
};
export default function CareerUiPreviewModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [tab, setTab] = useState<PreviewTab>(tabs[0]);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  const [responses, setResponses] = useState<CareerFormResponse[]>([]);
  const [following, setFollowing] = useState(false);
  const [status, setStatus] =
    useState<CareerOpportunityManagementStatus>("saved");
  const [browserExpanded, setBrowserExpanded] = useState(false);
  return (
    <TalentCareerModal
      open
      onClose={onClose}
      title="UI 미리보기"
      panelClassName="max-w-[1040px]"
      bodyClassName="px-4 pb-6 sm:px-6"
    >
      <QueryClientProvider client={queryClient}>
        <div data-career-i18n-skip="true">
          <div className="sticky top-0 z-10 mb-5 flex flex-wrap gap-1.5 bg-modal py-2">
            {tabs.map((value) => (
              <MuteButton
                key={value}
                aria-pressed={tab === value}
                variant={tab === value ? "dark" : "neutral"}
                onClick={() => setTab(value)}
              >
                {value}
              </MuteButton>
            ))}
          </div>
          {tab === tabs[0] && <ChatPreview />}
          {tab === tabs[1] && (
            <div className="space-y-8">
              <CareerFormView
                form={form}
                responses={responses}
                onRespond={(submission) => {
                  setResponses([
                    {
                      ...submission,
                      formId: form.formId,
                      revision: form.revision,
                      formSnapshot: form,
                      requestId: "preview",
                    },
                  ]);
                }}
              />
              <CareerCallProposalCard
                title="모의 면접"
                description="선택한 기회를 바탕으로 인터뷰를 연습해요."
              >
                <MuteButton variant="dark">시작하기</MuteButton>
                <MuteButton>나중에</MuteButton>
              </CareerCallProposalCard>
              <PreviewUI
                icon={<FileText className="size-5" />}
                title="지원용 이력서.pdf"
                description="이력서 · 수정안"
              />
              <ThinkingLogPanel
                active
                logs={[
                  "공고와 이력서를 확인하고 있어요.",
                  "지원 조건을 비교하고 있어요.",
                ]}
              />
              <RichText variant="career">
                {
                  "| 회사 | 역할과 근무 조건 | 확인할 내용 |\n| --- | --- | --- |\n| Example Labs | 고객 문제 정의부터 제품 설계와 백엔드 개발까지 참여하는 역할입니다. 주 2일 원격근무가 가능합니다. | 긴 링크도 줄바꿈됩니다: https://example.invalid/a-very-long-application-url-without-spaces |\n| Orbit | 글로벌 팀과 함께 데이터 플랫폼을 개발하고 운영합니다. | 협업 시간과 보상 범위를 확인해 주세요. |"
                }
              </RichText>
            </div>
          )}
          {tab === tabs[2] && <SearchPreview />}
          {tab === tabs[3] && (
            <div className="space-y-5">
              <BrowserPreviewSurface
                liveUrl={null}
                title="Example Labs · 지원 중"
                status="입력 내용 확인 중"
                expanded={browserExpanded}
                onExpand={() => setBrowserExpanded((value) => !value)}
              />
              {process.env.NODE_ENV !== "production" && (
                <iframe
                  title="Apply with Harper 단계별 미리보기"
                  src="/career/preview/application"
                  className="h-[70dvh] w-full rounded-xl border border-stroke"
                />
              )}
            </div>
          )}
          {tab === tabs[4] && (
            <div className="space-y-6">
              <div inert className="flex flex-wrap gap-5">
                <GmailIntegrationActionContent />
                <GmailIntegrationActionContent connected />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <FollowButton
                  following={following}
                  disabled={false}
                  onClick={() => setFollowing((value) => !value)}
                />
                <OpportunityStatusDropdown
                  prominent
                  status={status}
                  onChange={setStatus}
                />
              </div>
            </div>
          )}
          {tab === tabs[5] && <CareerGlassDevControls />}
        </div>
      </QueryClientProvider>
    </TalentCareerModal>
  );
}
