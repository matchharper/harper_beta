// career-i18n-skip-file: Internal developer controls and synthetic preview copy.
import {
  AlertTriangle,
  BriefcaseBusiness,
  Check,
  Clock3,
  History,
  Loader2,
  MessageSquareText,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  Terminal,
} from "lucide-react";
import React from "react";
import CareerCheckpointDevControls from "./CareerCheckpointDevControls";
import { CAREER_CHECKPOINT_USER_ID } from "@/lib/career/devCheckpointContract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { DevColorPaletteControls } from "@/components/common/DevColorPaletteControls";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerReengagementPendingActions } from "@/hooks/career/useCareerReengagementPendingActions";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import type { CareerReengagementPendingAction } from "@/lib/career/pendingActions";
import type { CareerTextChatModelId } from "@/lib/career/textChatModelConfig";
import { getCareerBrowserTimeZone } from "@/lib/career/requestTimeZone";
import {
  CLAUDE_HAIKU_MODEL,
  CLAUDE_MODEL,
  GPT_6_LUNA_MODEL,
  GPT_61_SOL_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
  OPENROUTER_MUSE_SPARK_13_MODEL,
} from "@/lib/llm/modelConfig";
import { DEFAULT_OPPORTUNITY_DISCOVERY_AGENT_VARIANT } from "@/lib/opportunityDiscovery/types";
import type { SerializedOpportunityRun } from "@/lib/opportunityDiscovery/types";
import { useCareerDevSqlPromptHistoryStore } from "@/store/useCareerDevSqlPromptHistoryStore";
import { useCareerVoiceModelStore } from "@/store/useCareerVoiceModelStore";
import {
  CAREER_LIVE_MODEL,
  CAREER_REALTIME_MODEL,
  type CareerVoiceModelOverride,
} from "@/lib/career/voiceModel";
import { useCareerTextChatModelStore } from "@/store/useCareerTextChatModelStore";
import { useCareerPromptVariantStore } from "@/store/useCareerPromptVariantStore";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import {
  CAREER_PROMPT_FILES,
  CAREER_PROMPT_VARIANTS,
} from "@/lib/career/prompts/promptExperiment";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import { useBrowserSessionDevPreview } from "./BrowserSessionDock";
import CareerGlassDevControls from "./CareerGlassDevControls";
import { GmailIntegrationActionContent } from "./chat/GmailIntegrationAction";

const CareerRecommendationSearchPreview = dynamic(
  () => import("./CareerRecommendationSearchPreview")
);
const CareerExternalFitsDevModal = dynamic(
  () => import("./CareerExternalFitsDevModal")
);
const CareerBrowserUseDevModal = dynamic(
  () => import("./CareerBrowserUseDevModal")
);
const CareerAgentRunDevModal = dynamic(
  () => import("./CareerAgentRunDevModal")
);

const devVoiceModelOptions: Array<{
  label: string;
  value: CareerVoiceModelOverride;
}> = [
  { label: "Auto", value: null },
  { label: "GPT-Realtime 2.1", value: CAREER_REALTIME_MODEL },
  { label: "GPT-Live 1", value: CAREER_LIVE_MODEL },
];

const devTextChatModelOptions: Array<{
  eventKey: string;
  label: string;
  value: CareerTextChatModelId;
}> = [
  { eventKey: "sonnet_5_5", label: "Sonnet 5.5", value: CLAUDE_MODEL },
  { eventKey: "haiku_5_5", label: "Haiku 5.5", value: CLAUDE_HAIKU_MODEL },
  {
    eventKey: "glm_5_3_flash_high",
    label: "OpenRouter · GLM 5.3 Flash · high",
    value: OPENROUTER_GLM_53_FLASH_MODEL,
  },
  {
    eventKey: "muse_spark_1_3_xhigh",
    label: "OpenRouter · Muse Spark 1.3 · xhigh",
    value: OPENROUTER_MUSE_SPARK_13_MODEL,
  },
  {
    eventKey: "gpt_6_luna_xhigh",
    label: "GPT-6 Luna · xhigh",
    value: GPT_6_LUNA_MODEL,
  },
  {
    eventKey: "gpt_6_1_sol_high",
    label: "GPT-6.1 Sol · high",
    value: GPT_61_SOL_MODEL,
  },
];

type CareerDevSqlDraft = {
  expectedResult?: string;
  explanation?: string;
  sql?: string;
  validationErrors?: string[];
  warnings?: string[];
};

type CareerDevSqlExecutionResult = {
  command?: string | null;
  rowCount?: number | null;
};

type CareerDevCompanyRoleFtsResult = {
  elapsedSeconds?: number;
  error?: string;
  keywords?: string[];
  ok?: boolean;
  rowCount?: number;
  rows?: Array<Record<string, unknown>>;
  sourceType?: "all" | "internal";
};

type CareerDevPromptDebugPayload = {
  channel?: "text" | "voice";
  error?: string;
  ok?: boolean;
  renderedPrompt?: string;
  summary?: Record<string, unknown>;
};

type CareerDevPromptLogKind = "text" | "voice";

const getReengagementPendingActionKey = (
  action: CareerReengagementPendingAction
) => action.actionKey;

const getReengagementPendingActionLabel = (
  action: CareerReengagementPendingAction
) => {
  switch (action.kind) {
    case "internal_opportunity_call":
      return "역할 관련 통화";
    case "career_check_in_call":
      return "커리어 체크인 통화";
    case "company_request":
      return "회사 요청";
    case "internal_opportunity":
      return "Internal 연결 제안";
    case "meeting_schedule":
      return "미팅 일정 요청";
    case "reevaluation_question":
      return "Reevaluation criteria";
  }
};

const getReengagementPendingActionDescription = (
  action: CareerReengagementPendingAction
) => {
  switch (action.kind) {
    case "internal_opportunity_call":
      return `${action.companyName} · ${action.roleTitle}${action.reason ? ` · ${action.reason}` : ""}`;
    case "career_check_in_call":
      return `최근 커리어 변화 확인 · ${action.status}`;
    case "company_request":
      return `${action.companyName} · ${action.roleTitle} · ${action.request}`;
    case "internal_opportunity":
      return `${action.companyName} · ${action.roleTitle}${
        action.recommendationSummary ? ` · ${action.recommendationSummary}` : ""
      }`;
    case "meeting_schedule":
      return `${action.companyName} · ${action.roleTitle}`;
    case "reevaluation_question":
      return action.question;
  }
};

export default function CareerHomeDevControls({
  onOpenChat,
}: {
  onOpenChat: () => void;
}) {
  const logCareerEvent = useCareerLogEvent();
  const conversationVersion = useCareerWorkspaceUiStore(
    (state) => state.conversationVersion
  );
  const setConversationVersion = useCareerWorkspaceUiStore(
    (state) => state.setConversationVersion
  );
  const browserPreview = useBrowserSessionDevPreview();
  const [browserUseOpen, setBrowserUseOpen] = React.useState(false);
  const [pendingActionsOpen, setPendingActionsOpen] = React.useState(false);
  const { fetchWithAuth } = useCareerApi();
  const devSqlPromptHistory = useCareerDevSqlPromptHistoryStore(
    (state) => state.prompts
  );
  const addDevSqlPromptHistory = useCareerDevSqlPromptHistoryStore(
    (state) => state.addPrompt
  );
  const voiceModelOverride = useCareerVoiceModelStore(
    (state) => state.modelOverride
  );
  const setVoiceModelOverride = useCareerVoiceModelStore(
    (state) => state.setModelOverride
  );
  const textChatModel = useCareerTextChatModelStore((state) => state.model);
  const promptVariant = useCareerPromptVariantStore((state) => state.variant);
  const setPromptVariant = useCareerPromptVariantStore(
    (state) => state.setVariant
  );
  const setTextChatModel = useCareerTextChatModelStore(
    (state) => state.setModel
  );
  const {
    user,
    conversationId,
    stage,
    currentDataJobPostingRecommendationTestPending,
    opportunityRun,
    opportunityRunTriggerPending,
    onboardingCompletionTestPending,
    onRunCurrentDataJobPostingRecommendationTest,
    onRunOnboardingCompletionTest,
    onRunPeriodicOpportunityDiscoveryTest,
    onRunOpportunityDiscoveryTest,
    onRunSessionReengagementTest,
    sessionReengagementTestPending,
  } = useCareerSidebarContext();
  const [devSqlRequest, setDevSqlRequest] = React.useState("");
  const [devSqlDraft, setDevSqlDraft] =
    React.useState<CareerDevSqlDraft | null>(null);
  const [devSqlText, setDevSqlText] = React.useState("");
  const [devSqlError, setDevSqlError] = React.useState("");
  const [devSqlGenerating, setDevSqlGenerating] = React.useState(false);
  const [devSqlExecuting, setDevSqlExecuting] = React.useState(false);
  const [devManualRunId, setDevManualRunId] = React.useState("");
  const [devSqlResult, setDevSqlResult] =
    React.useState<CareerDevSqlExecutionResult | null>(null);
  const [devPromptLoggingKind, setDevPromptLoggingKind] =
    React.useState<CareerDevPromptLogKind | null>(null);
  const [devPromptLogStatus, setDevPromptLogStatus] = React.useState("");
  const [devRoleFtsLoading, setDevRoleFtsLoading] = React.useState(false);
  const [devRoleFtsStatus, setDevRoleFtsStatus] = React.useState("");
  const [wonderfulResetPending, setWonderfulResetPending] =
    React.useState(false);
  const [wonderfulResetStatus, setWonderfulResetStatus] = React.useState("");
  const wonderfulResetSubmitting = React.useRef(false);
  const [searchPreviewOpen, setSearchPreviewOpen] = React.useState(false);
  const [externalFitsOpen, setExternalFitsOpen] = React.useState(false);
  const [backgroundRun, setBackgroundRun] = React.useState<{
    id: string;
    userId: string;
    conversationId: string;
  } | null>(null);
  const backgroundRunId =
    backgroundRun &&
    backgroundRun.userId === user?.id &&
    backgroundRun.conversationId === conversationId
      ? backgroundRun.id
      : null;
  const [backgroundRunPending, setBackgroundRunPending] = React.useState(false);
  const [backgroundRunModalOpen, setBackgroundRunModalOpen] =
    React.useState(false);
  const [backgroundRunError, setBackgroundRunError] = React.useState("");
  const backgroundRequest = React.useRef<{
    conversationId: string;
    id: string;
  } | null>(null);
  const backgroundSubmitting = React.useRef(false);

  const showDevRunControls = canUseCareerDevControls(user?.email);
  const backgroundRunQuery = useQuery({
    queryKey: ["career-dev-background-run", user?.id, backgroundRunId],
    enabled: showDevRunControls && Boolean(backgroundRunId),
    queryFn: async (): Promise<SerializedOpportunityRun> => {
      const response = await fetchWithAuth(
        `/api/talent/opportunity-runs?ids=${backgroundRunId}`
      );
      const payload = await response.json();
      if (!response.ok || !payload.runs?.[0])
        throw new Error("실행 상태를 불러오지 못했습니다.");
      return payload.runs[0];
    },
    refetchInterval: (query) =>
      query.state.data?.active === false ? false : 3000,
  });
  const handleRunBackgroundAgent = async () => {
    if (!user || !conversationId || backgroundSubmitting.current) return;
    backgroundSubmitting.current = true;
    setBackgroundRunModalOpen(true);
    setBackgroundRun(null);
    setBackgroundRunPending(true);
    setBackgroundRunError("");
    if (backgroundRequest.current?.conversationId !== conversationId)
      backgroundRequest.current = { conversationId, id: crypto.randomUUID() };
    try {
      logCareerEvent("click_home_dev_career_background_agent");
      const response = await fetchWithAuth("/api/talent/dev-career-agent", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          requestId: backgroundRequest.current.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.runId)
        throw new Error(payload.error || "실행을 접수하지 못했습니다.");
      setBackgroundRun({ id: payload.runId, userId: user.id, conversationId });
      backgroundRequest.current = null;
    } catch (error) {
      setBackgroundRunError(
        error instanceof Error ? error.message : "실행을 접수하지 못했습니다."
      );
    } finally {
      backgroundSubmitting.current = false;
      setBackgroundRunPending(false);
    }
  };
  const queryClient = useQueryClient();
  const handleResetWonderfulRole = async () => {
    if (!user || wonderfulResetSubmitting.current) return;
    wonderfulResetSubmitting.current = true;
    setWonderfulResetPending(true);
    setWonderfulResetStatus("");
    try {
      logCareerEvent("click_home_dev_reset_wonderful_role");
      const response = await fetchWithAuth(
        "/api/talent/dev-reset-wonderful-role",
        {
          method: "POST",
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "역할 초기화에 실패했습니다.");
      }
      await Promise.all(
        [
          "career-history-opportunities",
          "career-opportunity-mentions",
          "career-reengagement-pending-actions",
          "career-pending-actions",
          "career-task-progress",
        ].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key, user.id] })
        )
      );
      setWonderfulResetStatus(
        "Wonderful Korea FDE를 Harper의 연결 제안으로 다시 추천했습니다."
      );
    } catch (error) {
      setWonderfulResetStatus(
        error instanceof Error ? error.message : "역할 초기화에 실패했습니다."
      );
    } finally {
      wonderfulResetSubmitting.current = false;
      setWonderfulResetPending(false);
    }
  };
  const reengagementPendingActions = useCareerReengagementPendingActions({
    enabled: showDevRunControls && pendingActionsOpen,
    userId: user?.id,
  });
  const showLocalWorkerRunControls = process.env.NODE_ENV !== "production";
  const devAgentVariant = DEFAULT_OPPORTUNITY_DISCOVERY_AGENT_VARIANT;
  const opportunityRunLocked =
    opportunityRunTriggerPending || Boolean(opportunityRun?.inputLocked);
  const onboardingCompletionTestDisabled =
    onboardingCompletionTestPending || !conversationId || stage === "profile";
  const currentDataJobPostingRecommendationTestDisabled =
    currentDataJobPostingRecommendationTestPending ||
    !conversationId ||
    stage === "profile";
  const devManualWorkerCommand = devManualRunId
    ? [
        "cd /Users/gimhojin/Desktop/harper/harper_worker",
        `python3.11 opportunity_worker.py discovery --run-id ${devManualRunId}`,
      ].join("\n")
    : "";
  const currentPendingActions = reengagementPendingActions.data?.actions ?? [];
  const promptPendingActionCandidateKeys = new Set(
    (reengagementPendingActions.data?.promptActions ?? []).map(
      getReengagementPendingActionKey
    )
  );

  const handleLogDevPrompt = React.useCallback(
    async (kind: CareerDevPromptLogKind) => {
      if (!conversationId || devPromptLoggingKind) return;

      logCareerEvent(`click_home_dev_${kind}_prompt_log`);
      setDevPromptLoggingKind(kind);
      setDevPromptLogStatus("");

      try {
        const response = await fetchWithAuth("/api/talent/debug-prompt", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            kind,
            timeZone: getCareerBrowserTimeZone(),
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as
          | CareerDevPromptDebugPayload
          | Record<string, never>;

        if (!response.ok || !payload.ok) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "프롬프트 로그 생성에 실패했습니다."
          );
        }

        const channel = payload.channel ?? kind;
        const label = `[CareerPromptDebug:${channel}]`;
        console.groupCollapsed(`${label} ${conversationId}`);
        console.info("summary", payload.summary ?? null);
        console.log(payload.renderedPrompt ?? "(empty prompt)");
        console.log("raw payload", payload);
        console.groupEnd();

        setDevPromptLogStatus(
          `${channel === "voice" ? "Voice" : "Text"} 프롬프트를 브라우저 콘솔과 서버 로그에 출력했습니다.`
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "프롬프트 로그 생성에 실패했습니다.";
        console.error("[CareerPromptDebug] browser log failed", error);
        setDevPromptLogStatus(message);
      } finally {
        setDevPromptLoggingKind(null);
      }
    },
    [conversationId, devPromptLoggingKind, fetchWithAuth, logCareerEvent]
  );

  const handleRunDevCompanyRoleFts = React.useCallback(
    async (args?: { sourceType?: "internal" }) => {
      if (devRoleFtsLoading) return;

      const internalOnly = args?.sourceType === "internal";
      const rawKeywords = window.prompt(
        internalOnly
          ? "internal company_roles FTS 검색 키워드\n쉼표나 줄바꿈으로 여러 개 입력할 수 있습니다."
          : "company_roles FTS 검색 키워드\n쉼표나 줄바꿈으로 여러 개 입력할 수 있습니다.",
        internalOnly ? "CTO" : "founding engineer, machine learning"
      );
      if (rawKeywords === null) return;

      const keywords = rawKeywords
        .split(/[\n,]+/)
        .map((keyword) => keyword.trim())
        .filter(Boolean);
      if (keywords.length === 0) return;

      logCareerEvent(
        internalOnly
          ? "click_home_dev_internal_company_roles_fts"
          : "click_home_dev_company_roles_fts"
      );
      setDevRoleFtsLoading(true);
      setDevRoleFtsStatus("");
      try {
        const response = await fetchWithAuth(
          "/api/talent/dev-company-role-search",
          {
            method: "POST",
            body: JSON.stringify({
              keywords,
              limit: 25,
              ...(internalOnly ? { sourceType: "internal" } : {}),
            }),
          }
        );
        const payload = (await response
          .json()
          .catch(() => ({}))) as CareerDevCompanyRoleFtsResult;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "company_roles FTS 검색 실패");
        }

        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        const elapsedSeconds =
          typeof payload.elapsedSeconds === "number"
            ? payload.elapsedSeconds
            : null;
        const sourceTypeLabel =
          payload.sourceType === "internal" || internalOnly
            ? "internal"
            : "all";
        const summary = `${sourceTypeLabel} · ${payload.rowCount ?? rows.length}개 · ${
          elapsedSeconds === null ? "-" : `${elapsedSeconds}s`
        }`;

        console.groupCollapsed(
          `[company_roles FTS:${sourceTypeLabel}] ${summary} · ${(payload.keywords ?? keywords).join(", ")}`
        );
        console.table(
          rows.map((row) => ({
            rank: row.search_rank,
            role: row.role_name,
            company: row.company_name,
            status: row.status,
            source: row.source_type,
            location: row.location_text,
            matched: Array.isArray(row.matched_keywords)
              ? row.matched_keywords.join(", ")
              : row.matched_keywords,
            posted_at: row.posted_at,
            url: row.external_jd_url,
          }))
        );
        console.log(rows);
        console.groupEnd();

        setDevRoleFtsStatus(`FTS ${summary} · 콘솔 확인`);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "company_roles FTS 검색 실패";
        console.warn("[CareerHomeDevControls] company_roles FTS failed", error);
        setDevRoleFtsStatus(message);
      } finally {
        setDevRoleFtsLoading(false);
      }
    },
    [devRoleFtsLoading, fetchWithAuth, logCareerEvent]
  );

  const handleGenerateDevSql = React.useCallback(async () => {
    const request = devSqlRequest.trim();
    if (!request || devSqlGenerating || devSqlExecuting) return;

    logCareerEvent("click_home_dev_sql_generate");
    addDevSqlPromptHistory(request);
    setDevSqlGenerating(true);
    setDevSqlError("");
    setDevSqlResult(null);
    try {
      const response = await fetchWithAuth("/api/talent/dev-sql", {
        method: "POST",
        body: JSON.stringify({ request }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        draft?: CareerDevSqlDraft;
        error?: string;
      };

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "SQL 생성에 실패했습니다.");
      }

      setDevSqlDraft(payload.draft);
      setDevSqlText(payload.draft.sql ?? "");
    } catch (error) {
      setDevSqlError(
        error instanceof Error ? error.message : "SQL 생성에 실패했습니다."
      );
    } finally {
      setDevSqlGenerating(false);
    }
  }, [
    addDevSqlPromptHistory,
    devSqlExecuting,
    devSqlGenerating,
    devSqlRequest,
    fetchWithAuth,
    logCareerEvent,
  ]);

  const handleExecuteDevSql = React.useCallback(async () => {
    const sql = devSqlText.trim();
    if (!sql || devSqlExecuting || devSqlGenerating) return;
    if (
      !window.confirm(
        "현재 로그인 계정의 DB 상태가 변경됩니다. 표시된 SQL을 실행할까요?"
      )
    ) {
      return;
    }

    logCareerEvent("click_home_dev_sql_execute");
    setDevSqlExecuting(true);
    setDevSqlError("");
    setDevSqlResult(null);
    try {
      const response = await fetchWithAuth("/api/talent/dev-sql", {
        method: "PATCH",
        body: JSON.stringify({ sql }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: CareerDevSqlExecutionResult;
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "SQL 실행에 실패했습니다.");
      }

      setDevSqlResult(payload.result);
    } catch (error) {
      setDevSqlError(
        error instanceof Error ? error.message : "SQL 실행에 실패했습니다."
      );
    } finally {
      setDevSqlExecuting(false);
    }
  }, [
    devSqlExecuting,
    devSqlGenerating,
    devSqlText,
    fetchWithAuth,
    logCareerEvent,
  ]);

  if (!showDevRunControls) return null;

  return (
    <div
      data-career-i18n-skip="true"
      className="mt-5 rounded-2xl border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-4 shadow-(--shadow-sm)"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <Text as="div" type="eyebrow">
          Dev controls
        </Text>
        {opportunityRunLocked ? (
          <Text
            as="div"
            type="subtle"
            className="mt-1 inline-flex items-center gap-1.5 sm:mt-0"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            worker 처리 대기 중
          </Text>
        ) : null}
      </div>
      <div className="mt-4">
        <DevColorPaletteControls />
      </div>
      <fieldset className="mt-4 min-w-0 space-y-2">
        <legend className="text-[13px] font-medium text-neutral-primary">
          Career 버전
        </legend>
        <div className="flex flex-wrap gap-2">
          <MuteButton
            aria-pressed={conversationVersion === "professional"}
            variant={
              conversationVersion === "professional" ? "dark" : "default"
            }
            onClick={() => { setConversationVersion("professional"); setPromptVariant(null); }}
          >
            1. 포멀 · 전문적 (현재)
          </MuteButton>
          <MuteButton
            aria-pressed={conversationVersion === "friendly"}
            variant={conversationVersion === "friendly" ? "dark" : "default"}
            onClick={() => { setConversationVersion("friendly"); setPromptVariant(null); }}
          >
            2. 친근 · 컴팩트
          </MuteButton>
        </div>
      </fieldset>
      <div className="mt-3 space-y-2">
        <MuteButton
          onClick={() => void handleResetWonderfulRole()}
          disabled={!user || wonderfulResetPending}
        >
          {wonderfulResetPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {wonderfulResetPending
            ? "초기화 중..."
            : "Wonderful Korea FDE 초기화 · 다시 추천"}
        </MuteButton>
        {wonderfulResetStatus ? (
          <Text as="div" type="caption" role="status">
            {wonderfulResetStatus}
          </Text>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <MuteButton
            onClick={() => void handleRunBackgroundAgent()}
            disabled={
              !conversationId ||
              backgroundRunPending ||
              Boolean(
                backgroundRunId && backgroundRunQuery.data?.active !== false
              )
            }
          >
            {backgroundRunPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {backgroundRunPending ? "접수 중..." : "Career agent 1회 실행"}
          </MuteButton>
          {backgroundRunId ? (
            <MuteButton onClick={() => setBackgroundRunModalOpen(true)}>
              실행 로그 보기
            </MuteButton>
          ) : null}
          <Text as="span" type="subtle">
            현재 계정으로 실행하며, 실제 이메일이 발송될 수 있습니다.
          </Text>
        </div>
        {backgroundRunId ? (
          <Text as="div" type="subtle" role="status" className="break-all">
            {backgroundRunQuery.data
              ? {
                  queued: "대기 중",
                  running: "실행 중",
                  handed_off: "Career agent 처리 중",
                  completed: "완료",
                  failed: "실패",
                  cancelled: "취소됨",
                  partial: "일부 완료",
                }[backgroundRunQuery.data.status]
              : "접수됨"}{" "}
            · {backgroundRunId}
          </Text>
        ) : null}
        {backgroundRunError || backgroundRunQuery.error ? (
          <Text as="div" type="subtle" role="alert" className="text-critical">
            {backgroundRunError || backgroundRunQuery.error?.message}
          </Text>
        ) : null}
      </div>
      {backgroundRunModalOpen ? (
        <CareerAgentRunDevModal
          key={backgroundRunId ?? "pending"}
          runId={backgroundRunId}
          pending={backgroundRunPending}
          error={backgroundRunError}
          onRetry={() => void handleRunBackgroundAgent()}
          onClose={() => setBackgroundRunModalOpen(false)}
        />
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MuteButton onClick={() => setBrowserUseOpen(true)}>
          <Play className="size-3.5" />
          Browser Use
        </MuteButton>
        <MuteButton
          aria-pressed={browserPreview.open}
          disabled={!browserPreview.setOpen}
          onClick={() => {
            browserPreview.setOpen?.(!browserPreview.open);
            if (!browserPreview.open) onOpenChat();
          }}
        >
          <Play className="size-3.5" />
          지원 중 미리보기
        </MuteButton>
      </div>
      {browserUseOpen ? (
        <CareerBrowserUseDevModal onClose={() => setBrowserUseOpen(false)} />
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Text as="span" type="subtle">
          추천 검색 로딩
        </Text>
        <MuteButton onClick={() => setSearchPreviewOpen(true)}>
          <Play className="size-3.5" />
          로딩 미리보기
        </MuteButton>
      </div>
      {searchPreviewOpen ? (
        <CareerRecommendationSearchPreview
          onClose={() => setSearchPreviewOpen(false)}
        />
      ) : null}
      {process.env.NODE_ENV !== "production" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Text as="span" type="subtle">
            Apply with Harper
          </Text>
          <MuteButton asChild>
            <a
              href="/career/preview/application"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageSquareText aria-hidden className="size-3.5" />
              제안 받은 상태 미리보기
            </a>
          </MuteButton>
          <Text as="span" type="subtle">
            예시 데이터 · 새 탭에서 열기
          </Text>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Text as="span" type="subtle">
          외부 공고 fit
        </Text>
        <MuteButton
          onClick={() => setExternalFitsOpen(true)}
          disabled={!user?.id}
        >
          <BriefcaseBusiness className="size-3.5" />
          fit 목록 보기
        </MuteButton>
      </div>
      {externalFitsOpen && user?.id ? (
        <CareerExternalFitsDevModal
          userId={user.id}
          onClose={() => setExternalFitsOpen(false)}
        />
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Text as="span" type="subtle">
          Text LLM
        </Text>
        {devTextChatModelOptions.map((option) => {
          const selected = option.value === textChatModel;
          return (
            <MuteButton
              key={option.value}
              onClick={() => {
                logCareerEvent(`click_home_dev_text_model_${option.eventKey}`);
                setTextChatModel(option.value);
              }}
              variant={selected ? "dark" : "default"}
            >
              {option.label}
            </MuteButton>
          );
        })}
        <Text as="span" type="subtle" className="ml-1">
          다음 텍스트 메시지부터 적용
        </Text>
      </div>
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Text as="span" type="subtle">
            Prompt
          </Text>
          <MuteButton
            onClick={() => setPromptVariant(null)}
            variant={promptVariant === null ? "dark" : "default"}
          >
            기존 코드
          </MuteButton>
          {CAREER_PROMPT_VARIANTS.map((variant, index) => (
            <MuteButton
              key={variant}
              title={CAREER_PROMPT_FILES[variant]}
              aria-pressed={promptVariant === variant}
              onClick={() => { setConversationVersion("professional"); setPromptVariant(variant); }}
              variant={promptVariant === variant ? "dark" : "default"}
            >
              {`버전 ${index + 1} · ${["현재", "수정안", "직접 편집"][index]}`}
            </MuteButton>
          ))}
          {promptVariant && (
            <Text as="span" type="subtle" className="w-full">
              {CAREER_PROMPT_FILES[promptVariant]} · 파일 저장 후 다음
              메시지부터 적용
            </Text>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Text as="span" type="subtle">
          Voice
        </Text>
        {devVoiceModelOptions.map((option) => {
          const selected = option.value === voiceModelOverride;
          return (
            <MuteButton
              key={option.label}
              onClick={() => {
                logCareerEvent(
                  `click_home_dev_voice_model_${option.value ?? "auto"}`
                );
                setVoiceModelOverride(option.value);
              }}
              variant={selected ? "dark" : "default"}
            >
              {option.label}
            </MuteButton>
          );
        })}
        <Text as="span" type="subtle" className="ml-1">
          다음 통화부터 적용
        </Text>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <MuteButton
          onClick={() => void handleRunDevCompanyRoleFts()}
          disabled={devRoleFtsLoading}
        >
          {devRoleFtsLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          company_roles FTS
        </MuteButton>
        <MuteButton
          onClick={() =>
            void handleRunDevCompanyRoleFts({ sourceType: "internal" })
          }
          disabled={devRoleFtsLoading}
        >
          {devRoleFtsLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          internal roles FTS
        </MuteButton>
        <MuteButton
          onClick={() => {
            logCareerEvent("click_home_dev_discovery_run");
            void onRunOpportunityDiscoveryTest(devAgentVariant);
          }}
          disabled={opportunityRunLocked}
        >
          {opportunityRunTriggerPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          discovery_run 추가
        </MuteButton>
        <MuteButton
          onClick={() => {
            logCareerEvent("click_home_dev_periodic_discovery_run");
            void onRunPeriodicOpportunityDiscoveryTest(devAgentVariant);
          }}
          disabled={opportunityRunLocked}
        >
          {opportunityRunTriggerPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Clock3 className="h-3.5 w-3.5" />
          )}
          3일 경과 run 큐잉
        </MuteButton>
        {showLocalWorkerRunControls ? (
          <MuteButton
            onClick={() => {
              logCareerEvent(
                "click_home_dev_deepseek_fit_rerank_periodic_discovery_run"
              );
              setDevManualRunId("");
              void Promise.resolve(
                onRunPeriodicOpportunityDiscoveryTest(devAgentVariant, {
                  claimForManualProcessing: true,
                  externalSelectorMode: "deepseek_fit_rerank",
                  forceNew: true,
                })
              ).then((run) => {
                const runId =
                  run && typeof run === "object" && "id" in run
                    ? String(run.id ?? "").trim()
                    : "";
                if (runId) setDevManualRunId(runId);
              });
            }}
            disabled={opportunityRunTriggerPending}
          >
            {opportunityRunTriggerPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            변경된 방식 periodic run 만들기
          </MuteButton>
        ) : null}
        <MuteButton
          onClick={() => {
            logCareerEvent(
              "click_home_dev_current_data_job_posting_recommendation"
            );
            onOpenChat();
            void onRunCurrentDataJobPostingRecommendationTest();
          }}
          disabled={currentDataJobPostingRecommendationTestDisabled}
        >
          {currentDataJobPostingRecommendationTestPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <BriefcaseBusiness className="h-3.5 w-3.5" />
          )}
          현재 데이터로 포지션 추천
        </MuteButton>
        <MuteButton
          onClick={() => void handleLogDevPrompt("text")}
          disabled={!conversationId || Boolean(devPromptLoggingKind)}
        >
          {devPromptLoggingKind === "text" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageSquareText className="h-3.5 w-3.5" />
          )}
          Text 프롬프트 로그
        </MuteButton>
        <MuteButton
          onClick={() => void handleLogDevPrompt("voice")}
          disabled={!conversationId || Boolean(devPromptLoggingKind)}
        >
          {devPromptLoggingKind === "voice" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Phone className="h-3.5 w-3.5" />
          )}
          Voice 프롬프트 로그
        </MuteButton>
        <MuteButton
          onClick={() => {
            logCareerEvent("click_home_dev_onboarding_completion_test");
            void Promise.resolve(onRunOnboardingCompletionTest()).then((ok) => {
              if (ok) onOpenChat();
            });
          }}
          disabled={onboardingCompletionTestDisabled}
        >
          {onboardingCompletionTestPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          온보딩 종료 테스트
        </MuteButton>
        <MuteButton
          onClick={() => {
            logCareerEvent("click_home_dev_delete_recent_messages");
            void onRunSessionReengagementTest();
          }}
          disabled={sessionReengagementTestPending}
        >
          {sessionReengagementTestPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          최근 메시지 6개 삭제
        </MuteButton>
        <MuteButton
          onClick={() => {
            logCareerEvent("click_home_dev_reengagement_greeting_only");
            void onRunSessionReengagementTest({
              deleteRecentMessages: false,
            });
          }}
          disabled={sessionReengagementTestPending}
        >
          {sessionReengagementTestPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Clock3 className="h-3.5 w-3.5" />
          )}
          12시간 인사만
        </MuteButton>
        <MuteButton
          aria-haspopup="dialog"
          onClick={() => {
            setPendingActionsOpen(true);
            void reengagementPendingActions.refetch();
          }}
        >
          <Clock3 className="h-3.5 w-3.5" />
          Pending actions 전체 보기
        </MuteButton>
      </div>
      <TalentCareerModal
        open={pendingActionsOpen}
        onClose={() => setPendingActionsOpen(false)}
        title="현재 Pending actions"
        description="현재 계정의 re-engagement 조회 결과입니다. 종류별 최대 100개를 조회하며, prompt 후보는 최대 4개입니다. 과거 응답 당시의 입력 기록은 아닙니다."
        footer={
          <MuteButton
            onClick={() => void reengagementPendingActions.refetch()}
            disabled={reengagementPendingActions.isFetching}
          >
            {reengagementPendingActions.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            새로고침
          </MuteButton>
        }
      >
        <div data-career-i18n-skip="true" aria-busy={reengagementPendingActions.isFetching}>
          {reengagementPendingActions.isError ? (
            <p role="alert" className="mb-3 text-sm text-critical">
              {reengagementPendingActions.error.message}
            </p>
          ) : null}
          {reengagementPendingActions.isPending ? (
            <p role="status" className="text-sm text-neutral-muted">불러오는 중…</p>
          ) : reengagementPendingActions.data ? (
            <>
              <p className="mb-3 text-sm text-neutral-muted">
                조회 {currentPendingActions.length}개 · prompt 후보 {promptPendingActionCandidateKeys.size}개
              </p>
              {currentPendingActions.length === 0 ? (
                <p className="text-sm text-neutral-muted">현재 조회된 pending action이 없습니다.</p>
              ) : (
                <ol className="divide-y divide-neutral-1000-a10">
                  {currentPendingActions.map((action) => (
                    <li key={action.actionKey} className="space-y-2 py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-neutral-primary">
                          {getReengagementPendingActionLabel(action)}
                        </span>
                        <span className="text-xs text-neutral-muted">
                          {action.actionKey} · {promptPendingActionCandidateKeys.has(action.actionKey) ? "prompt 후보" : "prompt 제외"}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm text-neutral-primary">
                        {getReengagementPendingActionDescription(action)}
                      </p>
                      <details>
                        <summary className="cursor-pointer text-xs text-neutral-muted">상세 데이터</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-bg-weak p-3 text-xs leading-5 text-neutral-primary">
                          {JSON.stringify(action, null, 2)}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : null}
        </div>
      </TalentCareerModal>
      {devRoleFtsStatus ? (
        <Text as="div" type="subtle" className="mt-2">
          {devRoleFtsStatus}
        </Text>
      ) : null}
      {devPromptLogStatus ? (
        <Text as="div" type="subtle" className="mt-2">
          {devPromptLogStatus}
        </Text>
      ) : null}
      {devManualRunId ? (
        <div className="mt-3 rounded-xl border border-neutral-1000-a10 bg-bg-weak px-3 py-3">
          <Text as="div" type="subtle">
            생성된 run_id: {devManualRunId}
          </Text>
          <pre className="mt-2 max-w-full whitespace-pre-wrap break-all rounded-lg border border-neutral-1000-a05 bg-bg-floating px-3 py-2 text-[12px] leading-5 text-neutral-primary">
            {devManualWorkerCommand}
          </pre>
        </div>
      ) : null}
      <div className="mt-4 border-t border-neutral-1000-a05 pt-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Text as="div" type="eyebrow">
              현재 상태 변경
            </Text>
            <Text as="div" type="subtle" className="mt-1">
              현재 로그인 계정에 한정된 상태를 변경하기 위한 명령어를 생성하고
              실행
            </Text>
          </div>
          <MuteButton
            onClick={() => void handleGenerateDevSql()}
            disabled={
              devSqlGenerating ||
              devSqlExecuting ||
              devSqlRequest.trim().length === 0
            }
            className="mt-2 sm:mt-0"
          >
            {devSqlGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Terminal className="h-3.5 w-3.5" />
            )}
            {devSqlGenerating ? "생성 중..." : "적용할 SQL 생성"}
          </MuteButton>
        </div>
        <UiTextarea
          unstyled
          value={devSqlRequest}
          onChange={(event) => setDevSqlRequest(event.target.value)}
          placeholder="예: 추천된 기회 전부 삭제 / 최근 3일간 모든 추천 데이터 삭제"
          rows={3}
          className="mt-3 min-h-[86px] w-full resize-y rounded-xl border border-neutral-1000-a10 bg-bg-floating px-3 py-2 text-[13px] leading-5 text-neutral-primary outline-none transition-colors placeholder:text-neutral-placeholder focus:border-neutral-800"
        />
        {devSqlPromptHistory.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            <Text
              as="div"
              type="subtle"
              className="inline-flex items-center gap-1.5"
            >
              <History className="h-3.5 w-3.5" />
              최근 입력
            </Text>
            <div className="flex flex-wrap gap-1.5">
              {devSqlPromptHistory.map((prompt) => (
                <MuteButton
                  key={prompt}
                  onClick={() => {
                    logCareerEvent("click_home_dev_sql_prompt_history");
                    setDevSqlRequest(prompt);
                  }}
                  className="max-w-full rounded-button border border-neutral-1000-a05 bg-bg-floating px-2.5 py-1.5 text-left text-[12px] leading-4 text-neutral-primary transition-colors hover:border-neutral-800/40 hover:bg-bg-weak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
                >
                  <span className="block max-w-[240px] truncate sm:max-w-[320px]">
                    {prompt}
                  </span>
                </MuteButton>
              ))}
            </div>
          </div>
        ) : null}
        {devSqlError ? (
          <div className="mt-3 flex gap-2 rounded-xl border border-critical/30 bg-critical-faded px-3 py-2 text-[12px] leading-5 text-critical">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">{devSqlError}</span>
          </div>
        ) : null}
        {devSqlDraft ? (
          <div className="mt-3 space-y-3 rounded-xl border border-neutral-1000-a05 bg-bg-floating px-3 py-3 shadow-(--shadow-sm)">
            {devSqlDraft.explanation ? (
              <Text as="div" type="caption" className="text-neutral-primary">
                {devSqlDraft.explanation}
              </Text>
            ) : null}
            {devSqlDraft.expectedResult ? (
              <Text as="div" type="subtle">
                결과: {devSqlDraft.expectedResult}
              </Text>
            ) : null}
            {devSqlDraft.warnings?.length ? (
              <div className="space-y-1">
                {devSqlDraft.warnings.map((warning, index) => (
                  <Text
                    key={`${warning}-${index}`}
                    as="div"
                    type="caption"
                    className="text-primary"
                  >
                    주의: {warning}
                  </Text>
                ))}
              </div>
            ) : null}
            {devSqlDraft.validationErrors?.length ? (
              <div className="space-y-1 rounded-lg bg-critical-faded px-3 py-2">
                {devSqlDraft.validationErrors.map((validationError) => (
                  <Text
                    key={validationError}
                    as="div"
                    type="caption"
                    className="text-critical"
                  >
                    {validationError}
                  </Text>
                ))}
              </div>
            ) : null}
            <UiTextarea
              unstyled
              value={devSqlText}
              onChange={(event) => setDevSqlText(event.target.value)}
              rows={9}
              spellCheck={false}
              className="min-h-[210px] w-full resize-y rounded-xl border border-neutral-1000-a10 bg-bg-floating px-3 py-2 font-mono text-[12px] leading-5 text-neutral-primary outline-none transition-colors focus:border-neutral-800"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {devSqlResult ? (
                <Text as="div" type="subtle">
                  실행됨: {devSqlResult.command ?? "OK"}
                  {typeof devSqlResult.rowCount === "number"
                    ? ` · ${devSqlResult.rowCount} rows`
                    : ""}
                </Text>
              ) : (
                <Text as="div" type="subtle">
                  실행 전 SQL을 직접 확인하세요.
                </Text>
              )}
              <MuteButton
                onClick={() => void handleExecuteDevSql()}
                disabled={
                  devSqlExecuting ||
                  devSqlGenerating ||
                  devSqlText.trim().length === 0
                }
                variant="primary"
              >
                {devSqlExecuting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {devSqlExecuting ? "실행 중..." : "SQL 실행"}
              </MuteButton>
            </div>
          </div>
        ) : null}
      </div>
      <CareerGlassDevControls />
      <details className="mt-4 min-w-0" data-career-i18n-skip="true">
        <summary className="cursor-pointer text-[13px] font-medium">
          Gmail 연결 미리보기
        </summary>
        <div className="mt-3">
          <code className="text-xs text-neutral-muted">
            [[integration:gmail]]
          </code>
          <div inert className="mt-3 flex flex-wrap gap-6">
            <div className="min-w-0 max-w-full">
              <p className="text-xs text-neutral-muted">연결 전</p>
              <GmailIntegrationActionContent />
            </div>
            <div className="min-w-0 max-w-full">
              <p className="text-xs text-neutral-muted">연결 완료</p>
              <GmailIntegrationActionContent connected />
            </div>
          </div>
        </div>
      </details>
      {process.env.NODE_ENV !== "production" &&
      user?.id === CAREER_CHECKPOINT_USER_ID ? (
        <CareerCheckpointDevControls />
      ) : null}
    </div>
  );
}
