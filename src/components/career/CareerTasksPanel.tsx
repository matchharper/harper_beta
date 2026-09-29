import {
  Blocks,
  CalendarClock,
  ChevronRight,
  CircleHelp,
  FileText,
  Handshake,
  Link2,
  Loader2,
  MessageSquareText,
  PhoneCall,
  RefreshCw,
  Scan,
  Search,
} from "lucide-react";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { MuteButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerTasks } from "@/hooks/career/useCareerTasks";
import { useCareerTaskSuggestions } from "@/hooks/career/useCareerTaskSuggestions";
import { useCareerChatPanelContext } from "./CareerChatPanelContext";
import CareerHomeDevControls from "./CareerHomeDevControls";
import CareerHomePanel from "./CareerHomePanel";
import CareerWelcomeHeader from "./CareerWelcomeHeader";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "./CareerSidebarContext";
import { CompanyLogo } from "./watchlist/CompanyLogo";
import { getCareerTaskSectionOrder } from "@/lib/career/taskItems";
import type {
  CareerComposerPendingAction,
  CareerPendingAction,
} from "@/lib/career/pendingActions";

type CareerTasksPanelProps = {
  onOpenChat: () => void;
  onOpenChatAction: (action: CareerComposerPendingAction) => void;
  onOpenOpportunity: (roleId: string, historyTab: "new" | "saved") => void;
  onOpenProfile: () => void;
  showTitle?: boolean;
};

function TaskRow({
  icon,
  meta,
  title,
  description,
  action,
  emphasized = false,
}: {
  icon: ReactNode;
  meta?: string;
  title: string;
  description?: string | null;
  action?: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <article className="flex items-start gap-3 border-b border-neutral-1000-a05 py-5 last:border-b-0">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-weak text-neutral-muted">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        {meta ? (
          <Text as="p" type="caption" tone="muted" className="mb-1">
            {meta}
          </Text>
        ) : null}
        <Text
          as="h3"
          type="body"
          className={emphasized ? "font-medium" : undefined}
        >
          {title}
        </Text>
        {description ? (
          <Text
            as="p"
            type="desc"
            tone="muted"
            className="mt-1.5 whitespace-pre-wrap break-words line-clamp-3"
          >
            {description}
          </Text>
        ) : null}
        {action ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div>
        ) : null}
      </div>
    </article>
  );
}

function TaskSuggestionSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-neutral-1000-a05 py-5 last:border-b-0"
    >
      <Skeleton className="mt-0.5 h-9 w-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-7 w-24" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default function CareerTasksPanel({
  onOpenChat,
  onOpenChatAction,
  onOpenOpportunity,
  onOpenProfile,
  showTitle = true,
}: CareerTasksPanelProps) {
  const t = useCareerT();
  const router = useRouter();
  const tasks = useCareerTasks(true);
  const taskSuggestions = useCareerTaskSuggestions();
  const openProfileLinks = () => {
    const isPreview = router.pathname === "/career/preview";
    void router.push(
      {
        pathname: isPreview ? router.pathname : "/career/profile",
        query: isPreview
          ? { ...router.query, tab: "profile", profileSection: "links" }
          : { profileSection: "links" },
      },
      undefined,
      { shallow: true, scroll: false }
    );
  };
  const {
    isOnboardingDone,
    stage,
    workspaceDataLoading,
    callStartPending,
    onStartCallMode,
    onStartConversationStarter,
  } = useCareerSidebarContext();
  const { talentPreferences, profileVisibility } = useCareerProfileContext();
  const {
    inputMode,
    chatPending,
    assistantTyping,
    sessionPending,
    onboardingWrapupPending,
    opportunityFeedbackFollowUpPending,
    callWrapUpPending,
  } = useCareerChatPanelContext();
  const completed = isOnboardingDone || stage === "completed";
  const showCompletedState = completed || workspaceDataLoading;
  const actionLocked = Boolean(
    workspaceDataLoading ||
    sessionPending ||
    chatPending ||
    assistantTyping ||
    onboardingWrapupPending ||
    opportunityFeedbackFollowUpPending ||
    callWrapUpPending ||
    callStartPending ||
    inputMode === "call"
  );
  const canStartCall =
    !actionLocked &&
    Boolean(completed ? onStartConversationStarter : onStartCallMode);
  const internalEnabled =
    talentPreferences?.getInternalRecommendation !== false &&
    profileVisibility !== "dont_share";
  const externalEnabled =
    talentPreferences?.getExternalRecommendation !== false &&
    tasks.searchStatus !== "stopped";

  const startCall = (action?: CareerPendingAction) => {
    onOpenChat();
    if (action?.kind === "internal_opportunity_call") {
      void onStartCallMode?.({ internalCallRequestId: action.callRequest.id });
    } else if (completed) {
      void onStartConversationStarter?.({
        mode: "call",
        starterId: "career_check_in",
      });
    } else {
      void onStartCallMode?.();
    }
  };

  const callAction = (action?: CareerPendingAction) => (
    <MuteButton
      size="sm"
      disabled={
        action?.kind === "internal_opportunity_call"
          ? actionLocked || !onStartCallMode
          : !canStartCall
      }
      onClick={() => startCall(action)}
    >
      <PhoneCall className="h-3.5 w-3.5" />
      {action &&
      "callRequest" in action &&
      action.callRequest.status === "in_progress"
        ? t("career.tasks.resume_call", "이어서 통화하기")
        : t("career.tasks.start_call", "통화하기")}
    </MuteButton>
  );

  const suggestions = tasks.suggestions.map((action) => {
    if (action.kind === "internal_fit_question") {
      return (
        <TaskRow
          key={action.id}
          icon={<CircleHelp className="h-4 w-4" />}
          title={t(
            "career.tasks.fit_question",
            "더 잘 맞는 기회를 찾기 위해 확인하고 싶어요"
          )}
          description={action.prompt}
          action={
            <MuteButton
              size="sm"
              disabled={actionLocked}
              onClick={() => onOpenChatAction(action)}
            >
              {t("career.tasks.answer", "답변하기")}
            </MuteButton>
          }
        />
      );
    }
    if (action.kind === "internal_opportunity_call") {
      return (
        <TaskRow
          key={action.id}
          icon={<PhoneCall className="h-4 w-4" />}
          meta={`${action.callRequest.companyName} · ${action.callRequest.roleTitle}`}
          title={t("career.tasks.connection_call", "연결 전에 짧게 이야기해요")}
          description={
            action.callRequest.reason ??
            t(
              "career.tasks.connection_call_description",
              "포지션에 대해 이야기하고, 회사에 소개할 경험을 함께 정리해요."
            )
          }
          action={callAction(action)}
        />
      );
    }
    if (action.kind === "career_check_in_call") {
      return (
        <TaskRow
          key={action.id}
          icon={<PhoneCall className="h-4 w-4" />}
          title={t("career.tasks.check_in", "Harper와 5분 통화")}
          description={t(
            "career.tasks.check_in_description",
            "최근 상황이나 달라진 조건을 가볍게 이야기해요."
          )}
          action={callAction(action)}
        />
      );
    }
    return null;
  });
  if (
    !tasks.suggestions.some((action) => action.kind === "career_check_in_call")
  ) {
    suggestions.push(
      <TaskRow
        key="check-in"
        icon={<PhoneCall className="h-4 w-4" />}
        title={
          showCompletedState
            ? t("career.tasks.check_in", "Harper와 5분 통화")
            : t("career.tasks.onboarding_call", "5분 커리어 인터뷰로 시작해요")
        }
        description={
          showCompletedState
            ? t(
                "career.tasks.check_in_description",
                "최근 상황이나 달라진 조건을 가볍게 이야기해요."
              )
            : t(
                "career.tasks.onboarding_call_description",
                "경험과 원하는 조건을 알려주시면 맞는 기회를 찾기 시작해요."
              )
        }
        action={callAction()}
      />
    );
  }

  const sections = {
    decisions: {
      title: t("career.tasks.decisions", "지금 결정"),
      description: t(
        "career.tasks.decisions_description",
        "답변이나 선택을 기다리는 일이에요."
      ),
      count: tasks.decisionCount,
      content: (
        <>
          {tasks.meetingSchedules.map((meeting) => (
            <TaskRow
              key={meeting.scheduleId}
              emphasized
              icon={<CalendarClock className="h-4 w-4" />}
              meta={`${meeting.companyName} · ${meeting.roleTitle}`}
              title={t(
                "career.tasks.meeting",
                "인터뷰 가능한 시간을 알려주세요"
              )}
              action={
                <MuteButton
                  variant="primary"
                  size="sm"
                  onClick={() => void router.push(meeting.invitationPath)}
                >
                  {t("career.tasks.schedule", "일정 선택하기")}
                </MuteButton>
              }
            />
          ))}
          {[...tasks.decisions]
            .sort(
              (a, b) =>
                Number(b.kind === "company_request") -
                Number(a.kind === "company_request")
            )
            .map((action) => {
              if (action.kind === "company_request") {
                return (
                  <TaskRow
                    key={action.id}
                    emphasized
                    icon={
                      action.requestMode === "resume" ? (
                        <FileText className="h-4 w-4" />
                      ) : (
                        <MessageSquareText className="h-4 w-4" />
                      )
                    }
                    meta={`${action.companyName} · ${action.roleTitle}`}
                    title={
                      action.requestMode === "resume"
                        ? t(
                            "career.tasks.resume_request",
                            "회사에서 최신 이력서를 요청했어요"
                          )
                        : t(
                            "career.tasks.company_question",
                            "회사에서 확인하고 싶은 내용이 있어요"
                          )
                    }
                    description={action.prompt}
                    action={
                      <MuteButton
                        variant="primary"
                        size="sm"
                        disabled={actionLocked}
                        onClick={() => onOpenChatAction(action)}
                      >
                        {action.requestMode === "resume"
                          ? t("career.tasks.share_resume", "이력서 공유하기")
                          : t("career.tasks.answer", "답변하기")}
                      </MuteButton>
                    }
                  />
                );
              }
              if (action.kind !== "internal_opportunity") return null;
              return (
                <TaskRow
                  key={action.id}
                  emphasized
                  icon={
                    <CompanyLogo
                      logoUrl={action.companyLogoUrl}
                      name={action.companyName}
                      size="sm"
                    />
                  }
                  meta={`${action.companyName} · ${action.isCompanyIntro ? t("career.tasks.intro_request", "회사의 Intro 요청") : t("career.tasks.harper_offer", "Harper 연결 제안")}`}
                  title={action.roleTitle}
                  description={
                    action.recommendationSummary ??
                    t(
                      "career.tasks.connection_offer",
                      "연결 제안을 확인하고, 수락하거나 질문을 남겨주세요."
                    )
                  }
                  action={
                    <MuteButton
                      variant="primary"
                      size="sm"
                      onClick={() => onOpenOpportunity(action.roleId, "new")}
                    >
                      <Handshake className="h-3.5 w-3.5" />
                      {t("career.tasks.view_offer", "제안 보기")}
                    </MuteButton>
                  }
                />
              );
            })}
        </>
      ),
    },
    suggestions: {
      title: t("career.tasks.suggestions", "Harper 제안"),
      count: 0,
      content: (
        <>
          {suggestions}
          {taskSuggestions.externalLoading ? (
            <TaskSuggestionSkeleton
              label={t(
                "career.tasks.loading_feedback",
                "추천 피드백을 확인하고 있어요"
              )}
            />
          ) : taskSuggestions.externalError ? (
            <TaskRow
              icon={<RefreshCw className="h-4 w-4" />}
              title={t(
                "career.tasks.feedback_error",
                "추천 피드백 현황을 불러오지 못했어요"
              )}
              action={
                <MuteButton size="sm" onClick={taskSuggestions.retryExternal}>
                  {t("career.tasks.retry", "다시 불러오기")}
                </MuteButton>
              }
            />
          ) : taskSuggestions.externalFeedback.length > 0 ? (
            <TaskRow
              icon={
                <div className="grid grid-cols-2 grid-rows-2 gap-0.5">
                  {taskSuggestions.externalFeedback.map((item) => (
                    <CompanyLogo
                      key={item.id}
                      logoUrl={item.companyLogoUrl}
                      name={item.companyName}
                      size="xs"
                    />
                  ))}
                </div>
              }
              title={t(
                "career.tasks.feedback_request",
                "추천에 대한 피드백을 남겨주세요"
              )}
              description={t(
                "career.tasks.feedback_request_description",
                "마음에 드는 기회인지 알려주시면 다음 추천에 반영할게요."
              )}
              action={
                <MuteButton
                  size="sm"
                  onClick={() =>
                    onOpenOpportunity(
                      taskSuggestions.externalFeedback[0].roleId,
                      "new"
                    )
                  }
                >
                  {t("career.tasks.review_recommendations", "추천 확인하기")}
                  <ChevronRight className="h-3.5 w-3.5" />
                </MuteButton>
              }
            />
          ) : null}
          {taskSuggestions.sourcesLoading ? (
            <TaskSuggestionSkeleton
              label={t(
                "career.tasks.loading_sources",
                "연결된 자료를 확인하고 있어요"
              )}
            />
          ) : taskSuggestions.sourcesError ? (
            <TaskRow
              icon={<RefreshCw className="h-4 w-4" />}
              title={t(
                "career.tasks.sources_error",
                "연결된 자료를 확인하지 못했어요"
              )}
              action={
                <MuteButton size="sm" onClick={openProfileLinks}>
                  {t("career.tasks.check_sources", "연결 상태 확인하기")}
                </MuteButton>
              }
            />
          ) : taskSuggestions.sourceSuggestion ? (
            <TaskRow
              icon={<Blocks className="h-4 w-4" />}
              title={t(
                "career.tasks.sources_request",
                "어떤 일을 해왔는지 더 알려주세요"
              )}
              description={t(
                "career.tasks.sources_request_description",
                "경험과 관심사를 볼 수 있는 자료를 조금 더 알려주세요. 맞는 기회를 찾고 소개하는 데 도움이 돼요."
              )}
              action={
                <MuteButton size="sm" onClick={openProfileLinks}>
                  {taskSuggestions.sourceSuggestion.gmailMissing
                    ? t("career.tasks.add_sources", "추가 정보 제공하기")
                    : t("career.tasks.add_links", "추가 정보 제공하기")}
                  <ChevronRight className="h-3.5 w-3.5" />
                </MuteButton>
              }
            />
          ) : null}
        </>
      ),
    },
    working: {
      title: t("career.tasks.working", "Harper가 하는 중"),
      count: 0,
      content: (
        <>
          {tasks.progressLoading ? (
            <div role="status" className="space-y-3 py-5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <span className="sr-only">
                {t(
                  "career.tasks.loading_progress",
                  "진행 상황을 불러오고 있어요"
                )}
              </span>
            </div>
          ) : null}
          {tasks.progressError ? (
            <div className="py-4 text-sm text-neutral-muted">
              {t(
                "career.tasks.progress_error",
                "연결 진행 상황을 불러오지 못했어요."
              )}{" "}
              <MuteButton size="sm" onClick={tasks.refetch}>
                {t("career.tasks.retry", "다시 불러오기")}
              </MuteButton>
            </div>
          ) : null}
          {tasks.connections.map((connection) => (
            <TaskRow
              key={connection.id}
              icon={
                <CompanyLogo
                  logoUrl={connection.companyLogoUrl}
                  name={connection.companyName}
                  size="sm"
                />
              }
              meta={`${connection.companyName} · ${connection.roleTitle}`}
              title={
                connection.stage === "awaiting_company"
                  ? t(
                      "career.tasks.awaiting_company",
                      "회사 답변을 기다리고 있어요"
                    )
                  : t(
                      "career.tasks.preparing_connection",
                      "연결을 준비하고 있어요"
                    )
              }
              action={
                <MuteButton
                  variant="neutral"
                  size="sm"
                  onClick={() => onOpenOpportunity(connection.roleId, "saved")}
                >
                  {t("career.tasks.view_progress", "자세히 보기")}
                  <ChevronRight className="h-3.5 w-3.5" />
                </MuteButton>
              }
            />
          ))}
          <TaskRow
            icon={<Scan className="h-4 w-4" />}
            title={
              !showCompletedState
                ? t(
                    "career.tasks.learning",
                    "어떤 팀이 잘 맞을지 알아가고 있어요"
                  )
                : tasks.progressError
                  ? t(
                      "career.tasks.search_error",
                      "찾기 현황을 불러오지 못했어요"
                    )
                  : workspaceDataLoading || tasks.progressLoading
                    ? t(
                        "career.tasks.loading_search",
                        "찾기 현황을 확인하고 있어요"
                      )
                    : externalEnabled
                      ? t(
                          "career.tasks.searching",
                          "적합한 연결을 계속 찾고 있어요"
                        )
                      : internalEnabled
                        ? t(
                            "career.tasks.internal_search",
                            "잘 맞는 내부 연결 기회를 살펴보고 있어요"
                          )
                        : t("career.tasks.search_paused", "추천을 쉬고 있어요")
            }
            description={
              !showCompletedState
                ? t(
                    "career.tasks.learning_description",
                    "커리어 인터뷰를 마치면 경험과 조건에 맞는 기회를 찾기 시작해요."
                  )
                : workspaceDataLoading || tasks.progressLoading || tasks.progressError
                  ? null
                  : !externalEnabled && internalEnabled
                    ? t(
                        "career.tasks.internal_search_description",
                        "공개 포지션 추천은 쉬고, 내부 연결 기회를 살펴봐요."
                      )
                    : externalEnabled || internalEnabled
                      ? t(
                          "career.tasks.searching_description",
                          "적절한 기회가 생기면 알려드릴게요."
                        )
                      : t(
                          "career.tasks.search_paused_description",
                          "프로필에서 받고 싶은 추천을 다시 설정할 수 있어요."
                        )
            }
            action={<></>}
          />
        </>
      ),
    },
  };

  return (
    <div className="mx-auto w-full max-w-2xl py-7 text-neutral-primary">
      {!tasks.loading && tasks.decisionCount === 0 ? (
        <div className="hidden lg:block">
          <CareerWelcomeHeader align="left" />
        </div>
      ) : null}
      {showTitle ? (
        <SectionHeader className="mb-8">
          <SectionTitle as="h1" type="head1">
            {t("career.tasks.title", "할 일")}
          </SectionTitle>
        </SectionHeader>
      ) : null}
      {!completed && !workspaceDataLoading && (
        <div className="mb-8">
          <CareerHomePanel variant="onboarding" onOpenChat={onOpenChat} />
        </div>
      )}
      {tasks.error ? (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-info-faded p-3 text-sm text-neutral-primary"
        >
          <span className="flex-1">
            {t(
              "career.tasks.error",
              "일부 할 일을 불러오지 못했어요. 다시 확인해 주세요."
            )}
          </span>
          <MuteButton size="sm" onClick={tasks.refetch}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t("career.tasks.retry", "다시 불러오기")}
          </MuteButton>
        </div>
      ) : null}
      {tasks.loading ? (
        <div
          role="status"
          className="mb-8 flex items-center gap-2 text-sm text-neutral-muted"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("career.tasks.loading", "할 일을 불러오고 있어요")}
        </div>
      ) : null}
      <div className="space-y-9">
        {getCareerTaskSectionOrder(tasks.decisionCount > 0).map((key) => {
          const section = sections[key];
          return (
            <section
              key={key}
              aria-labelledby={`career-tasks-${key}`}
              data-career-task-section={key}
            >
              <SectionHeader className="gap-1.5">
                <div className="flex items-center gap-2">
                  <SectionTitle id={`career-tasks-${key}`}>
                    {section.title}
                  </SectionTitle>
                  {section.count > 0 ? (
                    <span className="text-[13px] mb-[1px] tracking-wider font-normal text-neutral-muted">
                      ({section.count})
                    </span>
                  ) : null}
                </div>
              </SectionHeader>
              <div>{section.content}</div>
            </section>
          );
        })}
      </div>
      <CareerHomeDevControls onOpenChat={onOpenChat} />
    </div>
  );
}
