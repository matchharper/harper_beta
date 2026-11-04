// career-i18n-skip-file: Local-only preview with synthetic data.
import { ArrowUp } from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useCallback, useRef, useState } from "react";

import TalentCareerModal from "@/components/common/TalentCareerModal";
import {
  careerTimelineMessageTextClassName,
  careerTimelineTypographyStyle,
} from "@/components/career/chat/careerTimelineTypography";
import OpportunityCard from "@/components/career/history/OpportunityCard";
import type {
  CareerHistoryOpportunity,
  CareerTalentContext,
  CareerTalentContextChange,
} from "@/components/career/types";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import { ChatMessageBubbleFrame } from "@/components/chat/ChatTimeline";
import { MuteButton } from "@/components/ui/button";
import { MessagesProvider } from "@/i18n/useMessage";
import { OpportunityType } from "@/lib/opportunityType";

import CareerMessageBubble from "@/components/career/chat/CareerMessageBubble";
import {
  CareerInlineUiProvider,
  type CareerInlineUiRuntime,
} from "@/components/career/chat/inline/CareerInlineUi";
import { formatCareerInlineUiReference } from "@/lib/career/inlineUi";
import { createEmptyHistoryOpportunityCounts } from "@/hooks/career/careerSessionData";

const previewMatchingId = "00000000-0000-4000-8000-000000000099";
const fixtureDate = "2026-11-03T03:00:00Z";

function opportunity(
  id: string,
  companyName: string,
  title: string,
  location: string,
  description: string,
  savedStage: CareerHistoryOpportunity["savedStage"] = null
): CareerHistoryOpportunity {
  return {
    id,
    roleId: `00000000-0000-4000-8000-${String(["lumen", "orbit", "bridge", "folio", "morrow", "stack", "tide"].indexOf(id) + 1).padStart(12, "0")}`,
    companyName,
    title,
    location,
    description,
    savedStage,
    clickedAt: null,
    companyDescription:
      "기업의 협업과 업무를 돕는 소프트웨어를 만드는 팀입니다.",
    companyHomepageUrl: null,
    companyLinkedinUrl: null,
    companyLogoUrl: null,
    employmentTypes: ["full_time"],
    externalJdUrl: null,
    feedback: savedStage ? "positive" : null,
    feedbackAt: savedStage ? fixtureDate : null,
    feedbackReason: null,
    href: null,
    isAccepted: false,
    isInternal: false,
    kind: "recommendation",
    opportunityType: OpportunityType.ExternalJd,
    postedAt: null,
    recommendedAt: fixtureDate,
    recommendationReasons: [],
    sourceJobId: null,
    sourceProvider: null,
    sourceType: "external",
    status: "active",
    viewedAt: fixtureDate,
    workMode: "hybrid",
  };
}

const initialOpportunities = [
  {
    ...opportunity(
      "lumen",
      "루멘웍스",
      "Senior Backend Engineer",
      "서울 성수",
      "B2B 협업 제품의 API와 데이터 구조를 설계합니다. 제품 담당자와 문제 정의부터 출시까지 함께합니다.\n\n주 2일 원격 근무 · 기본급 9,000만–1.2억 원",
      "connected"
    ),
    upcomingMeeting: {
      startAt: "2026-11-06T05:00:00Z",
      endAt: "2026-11-06T06:00:00Z",
      title: "기술 인터뷰",
    },
  },
  opportunity(
    "orbit",
    "오빗데스크",
    "Product Backend Engineer",
    "서울 을지로",
    "업무 자동화 제품의 백엔드를 개발합니다. 고객 인터뷰와 제품 설계에 개발자가 참여합니다.\n\n주 3일 원격 근무 · 기본급 8,500만–1.1억 원",
    "saved"
  ),
  opportunity(
    "bridge",
    "브릿지랩",
    "Backend Engineer",
    "국내 원격",
    "분산 팀에서 데이터 분석 제품의 핵심 API를 만듭니다. 모든 팀원이 문서로 제품을 설계합니다.\n\n국내 원격 근무 · 월 1회 서울 모임 · 기본급 9,000만–1.2억 원"
  ),
  opportunity(
    "folio",
    "폴리오클라우드",
    "Platform Backend Engineer",
    "서울 강남",
    "여러 제품팀이 사용하는 인증·결제 플랫폼을 설계합니다.\n\n주 1일 원격 근무 · 기본급 1억–1.3억 원"
  ),
  opportunity(
    "morrow",
    "모로우데이터",
    "Backend Engineer · Data",
    "서울 마포",
    "분석 제품의 쿼리 API와 고객용 관리 기능을 만듭니다.\n\n주 2일 원격 근무 · 보상 범위 미공개"
  ),
  opportunity(
    "stack",
    "스택포지",
    "Senior Software Engineer",
    "판교",
    "개발자를 위한 관측·운영 제품의 서버를 설계합니다.\n\n주 2일 원격 근무 · 기본급 9,500만–1.2억 원",
    "saved"
  ),
  opportunity(
    "tide",
    "타이드라인",
    "Backend Engineer",
    "서울 용산",
    "기업용 업무 플랫폼의 API를 설계하고 운영합니다.\n\n주 2일 원격 근무 · 기본급 9,000만–1.1억 원",
    "applied"
  ),
];
const recommendedIds = new Set(["lumen", "orbit"]);
const matchingIds = initialOpportunities.slice(0, 6).map(({ id }) => id);
const reviewReasons: Record<string, string> = {
  lumen:
    "제품 설계에 참여하는 백엔드 역할이고, 보상과 원격 근무 조건도 맞아요.",
  orbit:
    "고객 문제부터 함께 풀 수 있는 팀이에요. 희망 기본급은 제안 단계에서 확인이 필요해요.",
  bridge: "역할과 보상은 맞지만, 팀의 야간 대응 빈도가 확인되지 않았어요.",
  folio: "원격 근무가 주 1일로, 원하시는 주 2일 이상과 차이가 있어요.",
  morrow: "제품에 참여할 여지는 있어요. 기본급 범위를 확인하지 못했어요.",
  stack: "보상은 맞지만 인프라 운영 비중이 높고, 판교 출근이 필요해요.",
};
const initialBrief: CareerTalentContext[] = [
  [
    "next_scope",
    "다음 역할",
    "백엔드 개발을 중심으로 제품 방향과 설계에도 참여하고 싶어요.",
  ],
  [
    "location",
    "지역·근무 방식",
    "서울에서 주 2일 이상 원격 근무. 팀이 잘 맞으면 판교도 검토할 수 있어요.",
  ],
  [
    "compensation",
    "보상",
    "기본급 9,000만 원 이상. 스톡옵션은 별도로 보고 싶어요.",
  ],
  [
    "deal_breakers",
    "피하고 싶은 것",
    "잦은 야간 대응이나 상시 대기가 당연한 팀은 피하고 싶어요.",
  ],
  [
    "must_haves",
    "꼭 필요한 것",
    "고객 문제를 가까이서 보고 개발자가 제품 의사결정에 참여하는 팀.",
  ],
].map(([key, label, content], index) => ({
  id: index + 1,
  ref: index + 1,
  collection: "brief",
  importance: null,
  key,
  label,
  content,
  revision: 1,
  createdAt: fixtureDate,
  updatedAt: fixtureDate,
}));

function PreviewContent() {
  const [items, setItems] =
    useState<CareerHistoryOpportunity[]>(initialOpportunities);
  const [brief, setBrief] = useState(initialBrief);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  function toggleSave(item: CareerHistoryOpportunity) {
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? {
              ...row,
              savedStage: row.savedStage === "saved" ? null : "saved",
              feedback: row.savedStage === "saved" ? null : "positive",
            }
          : row
      )
    );
  }

  function mutateBrief(changes: CareerTalentContextChange[]) {
    setBrief((current) => {
      let next = [...current];
      let nextId = Math.max(0, ...current.map(({ id }) => id)) + 1;
      for (const change of changes) {
        if (change.op === "delete")
          next = next.filter(({ id }) => id !== change.id);
        else if (change.op === "update")
          next = next.map((row) =>
            row.id === change.id
              ? {
                  ...row,
                  content: change.content ?? row.content,
                  label: change.label ?? row.label,
                  revision: row.revision + 1,
                }
              : row
          );
        else {
          const id = nextId++;
          next.push({
            id,
            ref: id,
            collection: "brief",
            key: null,
            label: change.label ?? null,
            content: change.content,
            importance: null,
            revision: 1,
            createdAt: fixtureDate,
            updatedAt: fixtureDate,
          });
        }
      }
      return next;
    });
    return true;
  }

  function sendMessage() {
    if (!draft.trim()) return;
    setMessages((current) => [...current, draft.trim()]);
    setDraft("");
    composerRef.current?.focus();
  }

  const detailItem = items.find(({ id }) => id === detailId);

  function prepareApplication(item: CareerHistoryOpportunity) {
    setDetailId(null);
    setDraft(`${item.companyName}의 ${item.title} 지원 준비를 도와줘.`);
    composerRef.current?.focus();
  }

  const fetchPreview = useCallback<CareerInlineUiRuntime["fetchWithAuth"]>(
    async (url) => {
      const params = new URL(url, "http://localhost").searchParams;
      if (url.startsWith("/api/talent/matchings?")) {
        const results = initialOpportunities.filter(
          (item) =>
            matchingIds.includes(item.id) &&
            (params.get("excludeRecommended") !== "true" ||
              !recommendedIds.has(item.id))
        );
        const offset = params.get("cursor") ? Number(params.get("cursor")) : 0;
        const page = results.slice(offset, offset + 3);
        return Response.json({
          matching: {
            id: previewMatchingId,
            title: "백엔드 · 서울/원격 · 11월 3일",
          },
          opportunities: page.map((item) => ({
            id: item.id,
            roleId: item.roleId,
            isRecommended: recommendedIds.has(item.id),
            opportunity: {
              ...item,
              recommendationNote: reviewReasons[item.id],
            },
            title: item.title,
            companyName: item.companyName,
          })),
          nextCursor: offset + 3 < results.length ? String(offset + 3) : null,
          count: results.length,
        });
      }
      if (url.startsWith("/api/talent/opportunities?")) {
        const ids = params.get("roleIds")?.split(",") ?? [];
        return Response.json({
          items: initialOpportunities.filter((item) =>
            ids.includes(item.roleId)
          ),
        });
      }
      throw new Error("Unexpected preview request");
    },
    []
  );
  const counts = createEmptyHistoryOpportunityCounts();
  for (const item of items) {
    counts.total++;
    if (item.savedStage) {
      counts.saved++;
      counts.savedStages[item.savedStage]++;
    } else counts.new++;
  }
  const runtime: CareerInlineUiRuntime = {
    userId: "local-career-ui-preview",
    fetchWithAuth: fetchPreview,
    history: {
      historyOpportunities: items,
      historyOpportunityCounts: counts,
      historyLoading: false,
      historyUpdateError: "",
      onLoadMoreHistoryOpportunities: () => undefined,
      onLoadSavedStageHistoryOpportunityPages: () => undefined,
      getHistoryOpportunityPageFilterState: () => ({
        loading: false,
        nextOffset: null,
      }),
    },
    profile: { talentBrief: brief, mutateTalentContexts: mutateBrief },
    pendingIds: [],
    onOpen: (item) => setDetailId(item.id),
    onApply: prepareApplication,
    onSave: toggleSave,
  };
  const examples = [
    {
      user: "추천하지 않은 기회도 같이 보여줘.",
      text: "추천하지 않은 기회도 함께 가져왔어요.",
      reference: { type: "matching" as const, matchingId: previewMatchingId },
    },
    {
      user: "저장한 곳이랑 진행 중인 곳도 볼래.",
      text: "저장한 기회와 지원 현황이에요.",
      reference: { type: "opportunities" as const, scope: "all" as const },
    },
    {
      user: "내가 원하는 조건은 어떻게 정리돼 있어?",
      text: "이렇게 정리돼 있어요.",
      reference: { type: "brief" as const },
    },
  ];
  return (
    <CareerInlineUiProvider value={runtime}>
      <main
        className="flex h-dvh flex-col bg-bg-basement text-neutral-primary"
        data-career-i18n-skip="true"
        style={careerTimelineTypographyStyle}
      >
        <header className="mx-auto flex w-full max-w-[760px] shrink-0 items-center justify-between px-5 py-4 text-xs text-neutral-muted md:px-8">
          <span>Career UI</span>
          <span>예시 데이터</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto" data-preview-chat>
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-12 px-4 pb-8 pt-3 md:px-8">
            {examples.map((example, index) => (
              <section key={index} className="flex min-w-0 flex-col gap-5">
                <CareerMessageBubble
                  isUser
                  message={{
                    id: `user-${index}`,
                    role: "user",
                    content: example.user,
                    createdAt: fixtureDate,
                    messageType: "chat",
                  }}
                />
                <CareerMessageBubble
                  isUser={false}
                  message={{
                    id: `assistant-${index}`,
                    role: "assistant",
                    content: `${example.text}\n\n${formatCareerInlineUiReference(example.reference)}`,
                    createdAt: fixtureDate,
                    messageType: "chat",
                  }}
                />
              </section>
            ))}
            {messages.map((message, index) => (
              <ChatMessageBubbleFrame
                key={index}
                isUser
                animateEntrance
                className="my-0 md:my-0"
                typographyClassName={careerTimelineMessageTextClassName}
              >
                {message}
              </ChatMessageBubbleFrame>
            ))}
          </div>
        </div>
        <div className="mx-auto w-full max-w-[760px] shrink-0 px-5 pb-5 pt-3 md:px-8">
          <ChatComposerFrame
            ref={composerRef}
            aria-label="메시지"
            placeholder="Harper에게 이야기해 주세요"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                sendMessage();
              }
            }}
            action={
              <MuteButton
                aria-label="메시지 보내기"
                disabled={!draft.trim()}
                onClick={sendMessage}
                variant="dark"
              >
                <ArrowUp className="size-4" />
              </MuteButton>
            }
          />
        </div>
        <TalentCareerModal
          open={Boolean(detailItem)}
          onClose={() => setDetailId(null)}
          title={detailItem?.companyName}
          overlayClassName="items-stretch justify-end p-0 sm:p-0"
          backdropClassName="bg-black/10 backdrop-blur-none"
          panelClassName="h-dvh max-h-dvh max-w-[720px] rounded-none border-0 border-l border-neutral-1000-a05 shadow-lg data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
          bodyClassName="px-5 pb-6 sm:px-8"
        >
          {detailItem && (
            <OpportunityCard
              item={detailItem}
              expanded
              showUnreadIndicator={false}
              actions={
                <MuteButton
                  variant="dark"
                  onClick={() => prepareApplication(detailItem)}
                >
                  지원하기
                </MuteButton>
              }
            />
          )}
        </TalentCareerModal>
      </main>
    </CareerInlineUiProvider>
  );
}

export default function CareerChatUiPreview() {
  return (
    <>
      <Head>
        <title>Career 채팅 UI · Harper Preview</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <MessagesProvider locale="ko" persistPreference={false}>
        <PreviewContent />
      </MessagesProvider>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === "production" ? { notFound: true } : { props: {} };
