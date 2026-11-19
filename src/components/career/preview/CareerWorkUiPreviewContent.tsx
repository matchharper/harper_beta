// career-i18n-skip-file: Local-only preview with synthetic data.
import { useState, type ReactNode } from "react";
import { Typography } from "@/components/ui/typography";
import { CareerTurnPlan } from "@/components/career/chat/CareerTurnPlan";
import { CareerChecklistRows } from "@/components/career/chat/CareerChecklistRows";
import { CareerWorkActivityStatus } from "@/components/career/chat/CareerWorkActivity";
import { CareerPendingActionContextCard } from "@/components/career/chat/CareerPendingActionContextCard";
import type { CareerTurnPlanItem } from "@/lib/career/turnPlan";
import type { CareerForm, CareerFormResponse } from "@/lib/career/forms/schema";

const plans: { label: string; active: boolean; items: CareerTurnPlanItem[] }[] = [
  {
    label: "답변 작성 중",
    active: true,
    items: [
      { id: "1", text: "저장한 기회 3곳의 공고를 다시 확인하기", status: "done" },
      { id: "2", text: "원격 근무 조건이 맞는 곳 고르기", status: "in_progress" },
      { id: "3", text: "지원 순서와 준비할 것 정리하기", status: "pending" },
    ],
  },
  {
    label: "답변 완료",
    active: false,
    items: [
      { id: "1", text: "이력서에서 최근 프로젝트 찾기", status: "done" },
      { id: "2", text: "공고 요구 사항과 비교하기", status: "done" },
      { id: "3", text: "보완할 문장 제안하기", status: "done" },
    ],
  },
  {
    label: "중단됨 · 응답이 멈춘 상태",
    active: false,
    items: [
      { id: "1", text: "Example Labs 지원 페이지 열기", status: "done" },
      { id: "2", text: "지원서 항목 채우기", status: "in_progress" },
      { id: "3", text: "제출 전에 확인 요청하기", status: "pending" },
    ],
  },
];

const checklist: CareerForm = {
  formId: -201,
  revision: 1,
  kind: "suggestion",
  state: "open",
  title: "지원 전에 해 두면 좋은 일",
  items: [
    {
      id: "resume",
      type: "action",
      label: "이력서에 결제 플랫폼 이전 프로젝트 추가",
      description: "공고에서 대규모 마이그레이션 경험을 먼저 보고 있어요.",
      content: {},
      positive: { id: "done", label: "추가했어요", message: "이력서에 프로젝트를 추가했어요." },
    },
    {
      id: "referral",
      type: "action",
      label: "루멘웍스에 다니는 지인에게 팀 분위기 묻기",
      content: {},
      positive: { id: "done", label: "물어봤어요", message: "지인에게 물어봤어요." },
    },
    {
      id: "portfolio",
      type: "action",
      label: "GitHub 대표 저장소 README 정리",
      description: "설치 방법과 설계 의도를 앞쪽에 두면 좋아요.",
      content: {},
      positive: { id: "done", label: "정리했어요", message: "README를 정리했어요." },
    },
  ],
};

const initialChecklistResponses: CareerFormResponse[] = [
  {
    formId: checklist.formId,
    revision: checklist.revision,
    formSnapshot: checklist,
    requestId: "preview-referral",
    values: {},
    answers: [{ itemId: "referral", actionId: "done", values: {} }],
  },
];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <Typography variant="body" className="font-medium">{title}</Typography>
        {note && <Typography variant="description" className="text-neutral-muted">{note}</Typography>}
      </div>
      {children}
    </section>
  );
}

export default function CareerWorkUiPreviewContent() {
  const [responses, setResponses] = useState(initialChecklistResponses);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [activityStartedAt] = useState(() => new Date().toISOString());
  const applyChecklistRow = async (itemId: string, actionId: string, requestId: string) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    setResponses((current) => [
      ...current,
      {
        formId: checklist.formId,
        revision: checklist.revision,
        formSnapshot: checklist,
        requestId,
        values: {},
        answers: [{ itemId, actionId, values: {} }],
      },
    ]);
  };
  const pendingActions = [
    {
      id: "action-item",
      kind: "action_item" as const,
      revision: 1,
      title: "루멘웍스 기술 인터뷰 준비",
      description: "목요일 인터뷰 전에 시스템 설계 질문을 같이 연습해요.",
      buttonText: "연습하기",
      action: { type: "compose_reply" as const, text: "인터뷰 준비를 도와줘." },
      priority: 10,
      urgency: "soon" as const,
    },
    {
      id: "company-question",
      kind: "company_request" as const,
      companyLogoUrl: null,
      companyName: "오빗데스크",
      expiresAt: "2026-11-25T03:00:00Z",
      prompt: "입사 가능 시점과 희망 연봉 범위를 알려 주실 수 있을까요?",
      requestMode: "question" as const,
      resumeRequestToken: null,
      roleId: "00000000-0000-4000-8000-000000000002",
      roleTitle: "Product Backend Engineer",
    },
    {
      id: "company-resume",
      kind: "company_request" as const,
      companyLogoUrl: null,
      companyName: "브릿지랩",
      expiresAt: null,
      prompt: "최신 이력서를 보내 주시면 다음 단계를 안내드릴게요.",
      requestMode: "resume" as const,
      resumeRequestToken: "preview",
      roleId: "00000000-0000-4000-8000-000000000003",
      roleTitle: "Backend Engineer",
    },
    {
      id: "fit-question",
      kind: "internal_fit_question" as const,
      prompt: "주 1회 판교 출근이 필요한 팀도 괜찮으신가요?",
    },
  ].filter(({ id }) => !dismissed.includes(id));

  return (
    <div className="mx-auto max-w-[680px] space-y-10">
      <Section title="Plan · 답변 체크리스트" note="Harper가 한 답변 안에서 할 일을 적고 하나씩 진행할 때 보여요.">
        <div className="space-y-5">
          {plans.map((plan) => (
            <div key={plan.label} className="space-y-2">
              <Typography variant="description" className="text-neutral-muted">{plan.label}</Typography>
              <CareerTurnPlan items={plan.items} active={plan.active} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="작업 로그" note="도구를 쓰는 동안 답변 위에 실시간으로 보여요.">
        <CareerWorkActivityStatus
          activities={[
            {
              id: "preview-activity",
              logs: ["저장한 기회를 불러오고 있어요.", "공고 3개를 비교하고 있어요.", "지원 조건을 정리하고 있어요."],
              startedAt: activityStartedAt,
            },
          ]}
        />
      </Section>

      <Section title="액션 체크리스트" note="kind=suggestion이고 모든 항목이 action일 때 보여요. 행마다 따로 완료돼요.">
        <div className="career-glass w-full max-w-[640px] space-y-1 px-4 pb-1 pt-4 sm:px-5">
          <h3 className="text-base font-semibold leading-6">{checklist.title}</h3>
          <CareerChecklistRows form={checklist} responses={responses} unavailable={false} apply={applyChecklistRow} />
        </div>
      </Section>

      <Section title="답장 카드" note="할 일·회사 요청·확인 질문을 골랐을 때 입력창 위에 보여요.">
        <div className="space-y-3">
          {pendingActions.map((action) => (
            <CareerPendingActionContextCard
              key={action.id}
              action={action}
              expanded={expanded === action.id}
              onToggleExpanded={() => setExpanded((current) => (current === action.id ? null : action.id))}
              onDismiss={() => setDismissed((current) => [...current, action.id])}
              onUploadResume={() => undefined}
            />
          ))}
          {dismissed.length > 0 && (
            <button type="button" className="text-xs text-neutral-muted underline" onClick={() => setDismissed([])}>
              닫은 카드 다시 보기
            </button>
          )}
        </div>
      </Section>
    </div>
  );
}
