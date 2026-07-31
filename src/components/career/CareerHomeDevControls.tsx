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
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { DEFAULT_OPPORTUNITY_DISCOVERY_AGENT_VARIANT } from "@/lib/opportunityDiscovery/types";
import { useCareerDevSqlPromptHistoryStore } from "@/store/useCareerDevSqlPromptHistoryStore";
import {
  useCareerRealtimeProviderOverrideStore,
  type CareerRealtimeProviderOverride,
} from "@/store/useCareerRealtimeProviderOverrideStore";
import { useCareerSidebarContext } from "./CareerSidebarContext";

const devVoiceProviderOptions: Array<{
  label: string;
  value: CareerRealtimeProviderOverride;
}> = [
  { label: "Auto", value: null },
  { label: "OpenAI", value: "openai" },
  { label: "xAI", value: "xai" },
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

export default function CareerHomeDevControls({
  onOpenChat,
}: {
  onOpenChat: () => void;
}) {
  const logCareerEvent = useCareerLogEvent();
  const { fetchWithAuth } = useCareerApi();
  const devSqlPromptHistory = useCareerDevSqlPromptHistoryStore(
    (state) => state.prompts
  );
  const addDevSqlPromptHistory = useCareerDevSqlPromptHistoryStore(
    (state) => state.addPrompt
  );
  const voiceProviderOverride = useCareerRealtimeProviderOverrideStore(
    (state) => state.providerOverride
  );
  const setVoiceProviderOverride = useCareerRealtimeProviderOverrideStore(
    (state) => state.setProviderOverride
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

  const showDevRunControls = canUseCareerDevControls(user?.email);
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
      className="mt-5 rounded-2xl border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-4 shadow-sm"
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Text as="span" type="subtle">
          Voice
        </Text>
        {devVoiceProviderOptions.map((option) => {
          const selected = option.value === voiceProviderOverride;
          return (
            <MuteButton
              key={option.label}
              onClick={() => {
                logCareerEvent(
                  `click_home_dev_voice_provider_${option.value ?? "auto"}`
                );
                setVoiceProviderOverride(option.value);
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
          현재 데이터로 공고 추천
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
            logCareerEvent("click_home_dev_reengagement_test");
            void onRunSessionReengagementTest();
          }}
          disabled={sessionReengagementTestPending}
        >
          {sessionReengagementTestPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          최근 메시지 삭제 + 6시간 인사
        </MuteButton>
        <MuteButton
          onClick={() => {
            logCareerEvent("click_home_dev_reengagement_greeting_only");
            void onRunSessionReengagementTest({
              deleteLatestMessage: false,
            });
          }}
          disabled={sessionReengagementTestPending}
        >
          {sessionReengagementTestPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Clock3 className="h-3.5 w-3.5" />
          )}
          6시간 인사만
        </MuteButton>
      </div>
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
                  className="max-w-full rounded-lg border border-neutral-1000-a05 bg-bg-floating px-2.5 py-1.5 text-left text-[12px] leading-4 text-neutral-primary transition-colors hover:border-neutral-800/40 hover:bg-bg-weak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
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
          <div className="mt-3 space-y-3 rounded-xl border border-neutral-1000-a05 bg-bg-floating px-3 py-3 shadow-sm">
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
    </div>
  );
}
