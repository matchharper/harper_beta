// career-i18n-skip-file: Local-only preview with synthetic data.
import { useCallback, useState } from "react";

import CareerMessageBubble from "@/components/career/chat/CareerMessageBubble";
import {
  careerTimelineMessageTextClassName,
  careerTimelineTypographyStyle,
} from "@/components/career/chat/careerTimelineTypography";
import {
  CareerInlineUiProvider,
  type CareerInlineUiRuntime,
} from "@/components/career/chat/inline/CareerInlineUi";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { ChatMessageBubbleFrame } from "@/components/chat/ChatTimeline";
import { createEmptyHistoryOpportunityCounts } from "@/hooks/career/careerSessionData";
import type { CareerInlineCardRecord } from "@/lib/career/inlineCard";
import {
  formatCareerInlineUiReference,
  type CareerInlineCard,
} from "@/lib/career/inlineUi";
import { HIRING_SIGNAL_LABEL } from "@/lib/career/companies/labels";
import { OpportunityType } from "@/lib/opportunityType";

const fixtureDate = "2026-11-12T03:00:00Z";
const roleId = "00000000-0000-4000-8000-0000000000c1";
const companyId = "00000000-0000-4000-8000-0000000000c2";
const missingId = "00000000-0000-4000-8000-0000000000c3";

const role: CareerHistoryOpportunity = {
  id: `posting:${roleId}`,
  roleId,
  companyName: "루멘웍스",
  title: "Senior Backend Engineer",
  location: "서울 성수",
  description:
    "B2B 협업 제품의 API와 데이터 구조를 설계합니다. 제품 담당자와 문제 정의부터 출시까지 함께합니다.",
  roleSummary: null,
  recommendationSummary: null,
  companyHqLocation: "서울",
  companyEmployeeCountRange: { start: 51, end: 200 },
  savedStage: null,
  clickedAt: null,
  companyDescription: "기업의 협업을 돕는 소프트웨어를 만드는 팀입니다.",
  companyHomepageUrl: null,
  companyLinkedinUrl: null,
  companyLogoUrl: null,
  employmentTypes: ["full_time"],
  externalJdUrl: null,
  feedback: null,
  feedbackAt: null,
  feedbackReason: null,
  href: null,
  isAccepted: false,
  isInternal: false,
  kind: "recommendation",
  opportunityType: OpportunityType.ExternalJd,
  postedAt: fixtureDate,
  recommendedAt: fixtureDate,
  recommendationReasons: [],
  sourceJobId: null,
  sourceProvider: null,
  sourceType: "external",
  status: "active",
  viewedAt: null,
  workMode: "hybrid",
};

const company: NonNullable<CareerInlineCardRecord["company"]> = {
  id: companyId,
  name: "하버노트",
  logoUrl: null,
  website: "https://www.harbornote.example",
  topics: [
    {
      label: "summary",
      entries: [
        {
          checkedAt: fixtureDate,
          content:
            "하버노트는 연구자와 제품팀이 실험 기록을 함께 쓰는 협업 노트를 만듭니다[1](https://example.com/harbornote-about). 2021년에 설립했고, 2025년 시리즈 B로 220억 원을 투자받았습니다[2](https://example.com/harbornote-series-b).\n\n주요 고객은 바이오·제약 연구 조직입니다. 2026년에는 미국 보스턴에 사무실을 열고 현지 영업팀을 꾸리고 있습니다[3](https://example.com/harbornote-boston).\n\n| 항목 | 내용 |\n| --- | --- |\n| 설립 | 2021년 |\n| 팀 규모 | 약 80명 (1년 전 55명) |\n| 투자 | 시리즈 B, 220억 원 |\n\n엔지니어링 조직은 제품별 작은 팀으로 나뉘어 있고, 개발자가 고객 인터뷰에 직접 참여합니다[1](https://example.com/harbornote-about). 원격 근무는 주 2일까지 가능합니다[4](https://example.com/harbornote-careers).",
        },
      ],
    },
    {
      label: HIRING_SIGNAL_LABEL,
      entries: [
        {
          checkedAt: "2026-11-10T03:00:00Z",
          content:
            "CTO가 LinkedIn에 백엔드 팀을 두 배로 늘린다고 밝혔습니다[1](https://example.com/harbornote-cto-post).",
        },
        {
          checkedAt: "2026-10-21T03:00:00Z",
          content:
            "보스턴 사무실 개소와 함께 현지 엔지니어 채용 계획을 발표했습니다[2](https://example.com/harbornote-boston).",
        },
      ],
    },
  ],
};

const examples: { user: string; text: string; card: CareerInlineCard }[] = [
  {
    user: "지금까지 말한 조건 정리해 줄래?",
    text: "말씀하신 내용을 이렇게 정리했어요. 이대로 찾아볼까요?",
    card: {
      type: "card",
      title: "이번에 찾을 기회",
      items: [
        { label: "역할", content: "제품 설계에 참여하는 **백엔드 엔지니어**" },
        { label: "지역", content: "서울, 주 2일 이상 원격" },
        { label: "보상", content: "기본급 9,000만 원 이상\n스톡옵션은 따로 검토" },
        { label: "피할 것", content: "상시 대기가 당연한 팀" },
      ],
      negative: { label: "고칠게 있어요", message: "정리한 조건 중에 고칠 게 있어요." },
      positive: { label: "이대로 찾아줘", message: "정리한 조건으로 기회를 찾아줘." },
    },
  },
  {
    user: "백엔드 쪽 하나만 먼저 보여줘.",
    text: "제품 결정에 개발자가 직접 참여하는 팀이에요.",
    card: {
      type: "card",
      roleId,
      items: [
        { label: "맞는 점", content: "API 설계부터 출시까지 맡고, 고객 문제를 가까이에서 봐요." },
        { label: "확인할 점", content: "온콜 주기는 공고에 없어요. 연결되면 먼저 물어볼게요." },
      ],
    },
  },
  {
    user: "공고 없는 회사도 괜찮아. 연락해 볼 만한 곳 있어?",
    text: "공고는 없지만 백엔드 팀을 키우는 회사예요.",
    card: {
      type: "card",
      companyId,
      items: [
        { label: "왜 지금", content: "CTO가 백엔드 팀을 두 배로 늘린다고 밝혔어요." },
        { label: "연락 방법", content: "CTO에게 직접 메시지를 보내는 게 가장 빨라요. 원하시면 초안을 써 둘게요." },
      ],
    },
  },
  {
    user: "그 회사 자료만 다시 보여줘.",
    text: "Harper가 모아 둔 하버노트 자료예요.",
    card: { type: "card", companyId, items: [] },
  },
  {
    user: "없는 공고 카드는 어떻게 보여?",
    text: "기록을 찾지 못하면 직접 쓴 내용만 보여요.",
    card: {
      type: "card",
      roleId: missingId,
      title: "예전에 본 공고",
      items: [{ label: "메모", content: "마감되어 더 이상 조회되지 않는 공고예요." }],
    },
  },
];

export default function CareerCardUiPreviewContent() {
  const [replies, setReplies] = useState<string[]>([]);
  const fetchPreview = useCallback<CareerInlineUiRuntime["fetchWithAuth"]>(
    async (url) => {
      if (!url.startsWith("/api/talent/inline-card?"))
        throw new Error("Unexpected preview request");
      const params = new URL(url, "http://localhost").searchParams;
      await new Promise((resolve) => setTimeout(resolve, 350));
      const body: CareerInlineCardRecord<CareerHistoryOpportunity> = {
        role: params.get("roleId") === roleId ? role : null,
        company: params.get("companyId") === companyId ? company : null,
      };
      return Response.json(body);
    },
    []
  );
  const runtime: CareerInlineUiRuntime = {
    userId: "local-career-card-preview",
    fetchWithAuth: fetchPreview,
    history: {
      historyOpportunities: [],
      historyOpportunityCounts: createEmptyHistoryOpportunityCounts(),
      historyLoading: false,
      historyUpdateError: "",
      onLoadMoreHistoryOpportunities: () => undefined,
      onLoadSavedStageHistoryOpportunityPages: () => undefined,
      getHistoryOpportunityPageFilterState: () => ({
        loading: false,
        nextOffset: null,
      }),
    },
    profile: { talentBrief: [], mutateTalentContexts: () => true },
    pendingIds: [],
    onOpen: (item) =>
      setReplies((current) => [...current, `(상세 열기) ${item.companyName}`]),
    onApply: () => undefined,
    onSave: () => undefined,
    onSendMessage: (text) => setReplies((current) => [...current, text]),
  };
  return (
    <CareerInlineUiProvider value={runtime}>
      <div
        className="space-y-12 rounded-xl bg-bg-basement px-4 py-6 text-neutral-primary md:px-8"
        data-career-i18n-skip="true"
        style={careerTimelineTypographyStyle}
      >
        {examples.map((example, index) => (
          <section key={index} className="flex min-w-0 flex-col gap-5">
            <p className="font-mono text-[11px] leading-4 text-neutral-soft [overflow-wrap:anywhere]">
              {formatCareerInlineUiReference(example.card)}
            </p>
            <CareerMessageBubble
              isUser
              message={{
                id: `card-user-${index}`,
                role: "user",
                content: example.user,
                createdAt: fixtureDate,
                messageType: "chat",
              }}
            />
            <CareerMessageBubble
              isUser={false}
              message={{
                id: `card-assistant-${index}`,
                role: "assistant",
                content: `${example.text}\n\n${formatCareerInlineUiReference(example.card)}`,
                createdAt: fixtureDate,
                messageType: "chat",
              }}
            />
          </section>
        ))}
        {replies.length ? (
          <section className="flex flex-col gap-3">
            {replies.map((reply, index) => (
              <ChatMessageBubbleFrame
                key={index}
                isUser
                animateEntrance
                className="my-0 md:my-0"
                typographyClassName={careerTimelineMessageTextClassName}
              >
                {reply}
              </ChatMessageBubbleFrame>
            ))}
          </section>
        ) : null}
      </div>
    </CareerInlineUiProvider>
  );
}
