import fixture from "@/lib/career/simulation/fixtures/applicationPreview.json";
import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ArrowUp } from "lucide-react";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import CareerMessageBubble from "@/components/career/chat/CareerMessageBubble";
import { ThinkingLogPanel } from "@/components/career/chat/elements/ThinkingLogPanel";
import { DocumentPreviewCards } from "@/components/career/chat/elements/DocumentPreviewCards";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { ResumePreview } from "@/components/career/documents/ResumePreview";
import { installApplicationPreviewRuntime } from "@/lib/career/simulation/fixtures/applicationPreviewRuntime";
import type { GetServerSideProps } from "next";
import { MessagesProvider } from "@/i18n/useMessage";
import { MuteButton } from "@/components/ui/button";
import { ApplicationPreparationContext } from "@/components/career/chat/ApplicationPreparationContext";
import {
  ApplicationPreparationComposer,
  ApplicationPreparationReopen,
} from "@/components/career/chat/ApplicationPreparationComposer";
import { ApplicationQuestionHistoryRow } from "@/components/career/chat/ApplicationQuestionHistoryRow";
import { ApplicationStartCard } from "@/components/career/chat/ApplicationStartCard";
import { ApplicationSimulationCard } from "@/components/career/chat/elements/ApplicationSimulationCard";
import { createSimulationSession } from "@/lib/career/simulation/session";
import { createPreparation } from "@/lib/career/simulation/preparation";
import {
  suggestionAction,
  type ApplicationSuggestion,
} from "@/lib/career/simulation/suggestionSchema";
import {
  askApplicationInput,
  pendingApplicationBatch,
} from "@/lib/career/simulation/applicationInput";
import {
  projectLocalAnswers,
  type LocalQuestionAnswers,
} from "@/lib/career/simulation/localQuestionAnswers";
function initial(suggestions?: ApplicationSuggestion[]) {
  const s = createSimulationSession({
    roleName: "Example Labs · Software Engineer",
    roleRef: "job:local-preview",
    documentId: "preview-resume",
    documentName: fixture.text0,
  });
  s.analysisStatus = "completed";
  s.preparation = createPreparation();
  s.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  s.actions = suggestions
    ? suggestions.map((s) => suggestionAction(s))
    : [
        suggestionAction(
          {
            kind: "change",
            title: fixture.text1,
            reason: fixture.text2,
            edits: [
              {
                target: fixture.text3,
                originalText: fixture.text4,
                suggestedText: fixture.text5,
              },
            ],
          },
          "change"
        ),
        suggestionAction(
          { kind: "question", title: fixture.text6, reason: fixture.text7 },
          "question"
        ),
        suggestionAction(
          {
            kind: "material",
            title: fixture.text8,
            reason: fixture.text9,
            applicationField: "Why this role?",
            draftText: fixture.text10,
          },
          "material"
        ),
      ];
  return {
    messageId: 10,
    state: s.actions.length
      ? askApplicationInput(
          s,
          {
            purpose: "suggestions",
            items: s.actions.map((a) => ({ actionId: a.id })),
          },
          "preview"
        )
      : { ...s, preparation: { ...s.preparation!, showInputs: false } },
  };
}
const stages = [
  ["start", "1. 지원 시작"],
  ["progress", "2. 공고·이력서 분석"],
  ["suggestions", "3. 변경 검토·답변"],
  ["history", "4. 답변 기록"],
  ["ready", "5. 이력서 준비 완료"],
  ["browser", "6. 외부 사이트 입력"],
  ["input-approval", "7. 입력 중 전송 승인"],
  ["missing", "8. 추가 정보 질문"],
  ["submission", "9. 최종 제출 승인"],
  ["success", "10. 제출 성공"],
  ["failure", "11. 실패·수동 지원"],
  ["ended", "12. 직접 종료"],
] as const;
type Stage = (typeof stages)[number][0];
const isStage = (value: unknown): value is Stage =>
  stages.some(([id]) => id === value);
const roleName = "Example Labs · Software Engineer";
const resumeName = `${roleName}.pdf`;
const review = (final: boolean) =>
  [
    "**지원 사이트**: https://jobs.example.invalid/example-labs/application",
    `**전송 대상**: https://jobs.example.invalid/${final ? "applications/submit" : "api/non-user-graphql?op=ApiSetFormValue"}`,
    `- **Name**: ${final ? "김하퍼" : "비어 있음"}`,
    `- **Email**: ${final ? "preview@example.invalid" : "비어 있음"}`,
    `- **Phone Number**: ${final ? "+82 10-0000-0000" : "비어 있음"}`,
    `- **Resume**: ${final ? resumeName : "비어 있음"}`,
    "\n**선택한 첨부 파일**",
    `- ${resumeName}`,
    ...(!final
      ? [
          "\n**사이트 전송 내용**",
          '    {"operationName":"ApiSetFormValue","variables":{"path":"_systemfield_name","value":"김하퍼"}}',
        ]
      : []),
  ].join("\n");
function stageRecord(stage: Stage) {
  if (stage === "suggestions" || stage === "history") return initial();
  const record = initial([]);
  if (["input-approval", "submission", "missing"].includes(stage)) {
    record.state = askApplicationInput(
      record.state,
      stage === "missing"
        ? {
            purpose: "missing_required_information",
            introduction: "지원서에 LinkedIn 주소가 필수로 표시되어 있어요.",
            items: [
              {
                kind: "question",
                title: "지원서에 입력할 LinkedIn 프로필 URL을 알려주세요.",
              },
            ],
          }
        : {
            purpose: "final_submission",
            reviewMarkdown: review(stage === "submission"),
            items: [
              {
                kind: "choice",
                title: "이 내용을 지원 사이트로 전송할까요?",
                options: [
                  { id: "submit", label: "전송하기" },
                  { id: "cancel", label: "전송하지 않기" },
                ],
              },
            ],
          },
      `preview-${stage}`
    );
  }
  return record;
}
function Message({
  children,
  user = false,
}: {
  children: string;
  user?: boolean;
}) {
  return (
    <CareerMessageBubble
      isUser={user}
      message={{
        id: "preview-message",
        role: user ? "user" : "assistant",
        content: children,
        messageType: "chat",
        createdAt: "2026-10-26T03:00:00Z",
      }}
    />
  );
}
function Preview({ initialStage }: { initialStage: Stage }) {
  const router = useRouter();
  const [source, setSource] = useState(() => stageRecord(initialStage));
  const [local, setLocal] = useState<LocalQuestionAnswers | null>(null);
  const [view, setView] = useState<Stage>(initialStage);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState("");
  const [documentOpen, setDocumentOpen] = useState(false);
  const [documentError, setDocumentError] = useState(false);
  const [renderedReviewId, onReviewRendered] = useState<string>();
  const record = projectLocalAnswers(source, local);
  const batch = pendingApplicationBatch(source.state);
  const activeBatch = pendingApplicationBatch(record.state);
  const choose = (next: Stage) => {
    setView(next);
    setSource(stageRecord(next));
    setLocal(null);
    setReply("");
    setDraft("");
    onReviewRendered(undefined);
    void router.replace(
      { pathname: router.pathname, query: { stage: next } },
      undefined,
      { shallow: true }
    );
  };
  const sendChat = () => {
    if (!draft.trim()) return;
    if (view === "ready") choose("browser");
    else setReply(draft.trim());
    setDraft("");
  };
  const ordinaryComposer = (
    <ChatComposerFrame
      aria-label="메시지 입력"
      placeholder="메시지 입력"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          sendChat();
        }
      }}
      action={
        <MuteButton
          aria-label="보내기"
          disabled={!draft.trim()}
          onClick={sendChat}
        >
          <ArrowUp size={18} />
        </MuteButton>
      }
    />
  );
  return (
    <>
      <Head>
        <title>Apply with Harper · UI Preview</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main
        data-career-i18n-skip="true"
        className="min-h-dvh bg-bg-basement px-4 py-5 text-neutral-primary"
      >
        <div className="mx-auto flex max-w-[740px] flex-col gap-5">
          <nav aria-label="지원 과정 미리보기" className="flex flex-wrap gap-2">
            {stages.map(([id, label]) => (
              <MuteButton
                size="sm"
                key={id}
                aria-pressed={view === id}
                variant={view === id ? "dark" : "default"}
                onClick={() => choose(id)}
              >
                {label}
              </MuteButton>
            ))}
          </nav>
          <ApplicationPreparationContext.Provider
            value={{
              record,
              drafts: [],
              pending: false,
              error: "",
              renderedReviewId,
              onReviewRendered,
              command: async (input) => {
                if (input.operation === "end") {
                  choose("ended");
                  return true;
                }
                if (!batch) return false;
                const next: LocalQuestionAnswers = structuredClone(
                  local ?? {
                    batchId: batch.id,
                    requestId: "local",
                    responses: {},
                  }
                );
                if (
                  input.operation === "respond" &&
                  input.itemId &&
                  input.response
                ) {
                  next.responses[input.itemId] = input.response;
                  const index = batch.itemIds.indexOf(input.itemId);
                  next.currentItemId = batch.itemIds[index + 1] ?? input.itemId;
                  if (index === batch.itemIds.length - 1)
                    for (const id of batch.itemIds)
                      next.responses[id] ??= { decision: "skip" };
                  if (view === "input-approval" || view === "submission") {
                    // Reproduce the observed executor contract; never execute a website request.
                    setReply(
                      input.response.optionId === "submit"
                        ? view === "input-approval"
                          ? "input-sent"
                          : "success"
                        : "declined"
                    );
                  }
                }
                if (input.operation === "navigate")
                  next.currentItemId = input.itemId;
                if (input.operation === "clear" && input.itemId) {
                  delete next.responses[input.itemId];
                  next.clearedItemIds = [
                    ...(next.clearedItemIds ?? []),
                    input.itemId,
                  ];
                }
                if (input.operation === "hide") next.showInputs = false;
                if (input.operation === "show") next.showInputs = true;
                setLocal(next);
                return true;
              },
            }}
          >
            <section
              aria-label="실제 지원 UI"
              className="flex min-h-[60dvh] flex-col gap-6"
            >
              {view === "start" && (
                <>
                  <Message>
                    이 공고에 맞춰 이력서와 지원 답변을 준비할 수 있어요.
                  </Message>
                  <ApplicationStartCard
                    disabled={false}
                    messageId={1}
                    offer={{
                      version: 1,
                      status: "ready",
                      roleName,
                      roleTitle: "Software Engineer",
                      companyName: "Example Labs",
                      roleId: "preview-role",
                      selectedDocumentId: "preview-resume",
                      resumes: [
                        {
                          id: "preview-resume",
                          name: fixture.text0,
                          primary: true,
                        },
                      ],
                    }}
                    onAction={() => choose("progress")}
                  />
                </>
              )}
              {view === "progress" && (
                <>
                  <Message user>함께 지원 시작하기</Message>
                  <ApplicationSimulationCard
                    messageId={1}
                    simulation={{
                      version: 6,
                      status: "running",
                      progress: "candidate",
                      roleName,
                      documentName: fixture.text0,
                      updatedAt: new Date().toISOString(),
                      steps: [{ key: "review", status: "running" }],
                    }}
                  />
                </>
              )}
              {view === "suggestions" && (
                <Message>{fixture.introduction}</Message>
              )}
              {view === "history" && batch && (
                <ApplicationQuestionHistoryRow
                  batch={{
                    ...batch,
                    status: "submitted",
                    responses: {
                      change: {
                        decision: "accept",
                        edits: [
                          {
                            target: fixture.text3,
                            originalText: fixture.text4,
                            suggestedText: fixture.text5,
                          },
                        ],
                      },
                      question: { decision: "answer", text: fixture.answer },
                      material: { decision: "ignore" },
                    },
                  }}
                />
              )}
              {view === "ready" && (
                <>
                  <Message>
                    승인한 수정 내용을 이력서에 반영했어요. 준비된 이력서로
                    지원서 작성을 진행할까요?
                  </Message>
                  <div
                    onClickCapture={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDocumentOpen(true);
                    }}
                  >
                    <DocumentPreviewCards
                      documents={[{ id: "preview-resume", title: resumeName }]}
                    />
                  </div>
                </>
              )}
              {view === "browser" && (
                <>
                  <Message user>
                    준비된 이력서로 지원서 작성을 진행해줘.
                  </Message>
                  <ThinkingLogPanel
                    active
                    logs={[
                      "지원 사이트를 열고 입력 항목을 확인하고 있어요.",
                      "확인된 정보와 준비된 이력서를 입력하고, 최종 제출 전에 확인받겠습니다.",
                    ]}
                  />
                </>
              )}
              {activeBatch &&
                ["input-approval", "submission", "missing"].includes(view) && (
                  <ApplicationQuestionHistoryRow batch={activeBatch} />
                )}
              {view === "success" && (
                <Message>
                  Example Labs 지원서가 제출됐어요. 사이트에서 접수 완료 화면을
                  확인했습니다.
                </Message>
              )}
              {view === "failure" && (
                <Message>
                  지원서 입력 중 사이트 요청이 승인되지 않아 작업이 중단됐어요.
                  이력서 첨부와 최종 제출은 완료되지 않았습니다. 지원 사이트에서
                  직접 이어서 진행할 수 있어요.
                </Message>
              )}
              {view === "ended" && (
                <Message user>지원 준비를 종료할게.</Message>
              )}
              {reply === "declined" && (
                <Message>
                  사이트 전송이 승인되지 않아 중단됐어요. 이력서 첨부와 최종
                  제출은 완료되지 않았습니다.
                </Message>
              )}
              {reply === "input-sent" && (
                <ThinkingLogPanel
                  active
                  logs={[
                    "이름 저장 요청이 승인됐어요. 나머지 입력 항목을 확인하고 있어요.",
                  ]}
                />
              )}
              {reply === "success" && (
                <Message>
                  Example Labs 지원서가 제출됐어요. 사이트에서 접수 완료 화면을
                  확인했습니다.
                </Message>
              )}
              {reply &&
                !["declined", "input-sent", "success"].includes(reply) && (
                  <Message user>{reply}</Message>
                )}
              <div className="mt-auto pt-5 pb-4">
                {record.state.preparation?.showInputs && activeBatch ? (
                  <ApplicationPreparationComposer
                    key={source.state.sessionId}
                  />
                ) : activeBatch ? (
                  <ApplicationPreparationReopen />
                ) : (
                  <>
                    {[
                      "suggestions",
                      "input-approval",
                      "submission",
                      "missing",
                    ].includes(view) &&
                      record.state.activity!.batches.at(-1) && (
                        <div className="mb-5">
                          <ApplicationQuestionHistoryRow
                            batch={record.state.activity!.batches.at(-1)!}
                          />
                        </div>
                      )}
                    {ordinaryComposer}
                  </>
                )}
              </div>
            </section>
          </ApplicationPreparationContext.Provider>
        </div>
        <TalentCareerModal
          open={documentOpen}
          onClose={() => setDocumentOpen(false)}
          title={resumeName}
          panelClassName="max-w-[900px]"
        >
          {documentError ? (
            <p role="alert">이력서 미리보기를 불러오지 못했습니다.</p>
          ) : (
            <ResumePreview
              title={resumeName}
              documentId="preview-resume"
              trackOpen={false}
              onError={() => setDocumentError(true)}
              content={{
                language: "ko",
                basics: {
                  name: "김하퍼",
                  email: "preview@example.invalid",
                  location: "Seoul",
                },
                experience: [
                  {
                    title: "Software Engineer",
                    organization: "Example Studio",
                    period: "2021.01–2026.10",
                    bullets: [fixture.text5, fixture.answer],
                  },
                ],
              }}
            />
          )}
        </TalentCareerModal>
      </main>
    </>
  );
}
export default function ApplicationPreview({
  initialStage,
}: {
  initialStage: Stage;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const restore = installApplicationPreviewRuntime();
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(frame);
      restore();
    };
  }, []);
  return (
    <MessagesProvider locale="ko">
      {ready && <Preview initialStage={initialStage} />}
    </MessagesProvider>
  );
}
export const getServerSideProps: GetServerSideProps = async ({ query }) =>
  process.env.NODE_ENV === "production"
    ? { notFound: true }
    : { props: { initialStage: isStage(query.stage) ? query.stage : "start" } };
