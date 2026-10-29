import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import {
  CAREER_CHECKPOINT_LABEL,
  CAREER_CHECKPOINT_SHA256,
  type CareerCheckpointStatus,
} from "@/lib/career/devCheckpointContract";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import { useCareerCallContext } from "./CareerChatPanelContext";

const checkpointLabels: Record<string, string> = {
  talent_users: "프로필",
  talent_setting: "설정",
  talent_conversations: "대화",
  talent_messages: "채팅 메시지",
  talent_calls: "통화",
  talent_simulate_application: "지원 준비",
  talent_experiences: "경력",
  talent_educations: "학력",
  talent_extras: "추가 프로필",
  talent_insights: "프로필 인사이트",
  talent_contexts: "Brief·Memory",
  talent_context_write_requests: "Brief·Memory 변경 기록",
  talent_conversation_summaries: "대화 요약",
  talent_documents: "문서",
  talent_activity_events: "활동 기록",
  talent_behavior_contexts: "추천 참고 정보",
  talent_behavior_context_changes: "추천 참고 변경 기록",
  talent_company_follow: "관심 회사",
  talent_location_facets: "근무 지역",
  talent_profile_chunk_embeddings: "프로필 검색 정보",
  talent_profile_search_embeddings: "프로필 검색 요약",
  talent_external_fit: "외부 공고 적합도",
  talent_opportunity_fit: "내부 기회 적합도",
  talent_opportunity_recommendation: "추천 기회",
  talent_opportunity_tag: "기회 태그",
  talent_opportunity_matching_review: "추천 검토",
  talent_progress: "진행 이력",
  opportunity_discovery_run: "추천 검색 이력",
  opportunity_scheduler_state: "추천 일정",
  opportunity_scheduler_checks: "추천 일정 확인",
  external_recommendation_runs: "외부 추천 검색 이력",
  company_first_talent_scores: "회사별 적합도",
  company_role_candidate_evaluations: "회사측 평가",
  company_intro_candidates: "회사 연결 제안",
  company_talent_requests: "회사 연락",
  company_talent_followups: "후속 연락 일정",
  talent_opportunity_chat_preview: "채팅 기회 카드",
  talent_role_activity: "기회 활동",
  company_talent_relays: "연락 전달 기록",
};

export default function CareerCheckpointDevControls() {
  const { fetchWithAuth } = useCareerApi();
  const queryClient = useQueryClient();
  const workspace = useCareerSidebarContext();
  const call = useCareerCallContext();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [comparing, setComparing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [comparison, setComparison] =
    React.useState<CareerCheckpointStatus | null>(null);
  const status = useQuery({
    queryKey: ["career-fixed-checkpoint", workspace.user?.id],
    queryFn: async () => {
      const response = await fetchWithAuth("/api/talent/dev-checkpoint");
      const value = await response.json();
      if (!response.ok)
        throw new Error(
          value.message || value.error || "기준 데이터를 읽지 못했습니다."
        );
      return value as CareerCheckpointStatus;
    },
    retry: false,
    staleTime: Infinity,
  });
  const busy =
    workspace.currentDataJobPostingRecommendationTestPending ||
    workspace.callStartPending ||
    workspace.opportunityRunTriggerPending ||
    workspace.sessionReengagementTestPending ||
    workspace.onboardingCompletionTestPending ||
    call.callConnectionStatus === "connected" ||
    call.callConnectionStatus === "reconnecting";
  async function compare() {
    setComparing(true);
    setError("");
    try {
      const response = await fetchWithAuth(
        "/api/talent/dev-checkpoint?compare=1"
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || result.error || "비교에 실패했습니다."
        );
      setComparison(result);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "비교에 실패했습니다."
      );
    } finally {
      setComparing(false);
    }
  }
  async function restore() {
    if (pending || busy) return;
    setPending(true);
    setError("");
    try {
      const response = await fetchWithAuth("/api/talent/dev-checkpoint", {
        method: "POST",
        body: JSON.stringify({ checkpoint: CAREER_CHECKPOINT_SHA256 }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(result.error || "복원에 실패했습니다.");
      // Reload destroys chat-local state and all React Query/in-memory page caches.
      // Keep auth and developer model preferences for the next experiment.
      queryClient.clear();
      window.location.replace("/career");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "복원에 실패했습니다."
      );
      setPending(false);
    }
  }
  return (
    <section
      className="mt-4 border-t border-neutral-1000-a10 pt-4"
      aria-label="고정 상태 복원"
    >
      <Typography variant="caption">{CAREER_CHECKPOINT_LABEL}</Typography>
      <div className="mt-3 flex flex-wrap gap-2">
        <MuteButton
          onClick={() => void compare()}
          disabled={!status.data?.available || comparing || pending}
        >
          {comparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          변경 확인
        </MuteButton>
        <MuteButton
          variant="warn"
          onClick={() => {
            setError("");
            setConfirming(true);
          }}
          disabled={!status.data?.available || pending || busy}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          전체 되돌리기
        </MuteButton>
      </div>
      {busy ? (
        <Typography variant="caption" className="mt-2">
          대화·통화 종료 후 복원할 수 있습니다.
        </Typography>
      ) : null}
      {status.error ? (
        <Typography
          variant="caption"
          className="mt-2 text-critical"
          role="alert"
        >
          {status.error.message}
        </Typography>
      ) : null}
      {error && !confirming ? (
        <Typography
          variant="caption"
          className="mt-2 text-critical"
          role="alert"
        >
          {error}
        </Typography>
      ) : null}
      {comparison?.tables ? (
        <div className="mt-2" role="status">
          {comparison.tables.every((table) => !table.changed) ? (
            <Typography variant="caption">변경 없음</Typography>
          ) : null}
          {comparison.tables
            .filter((table) => table.changed)
            .map((table) => (
              <Typography key={table.name} variant="caption">
                {checkpointLabels[table.name] ?? table.name}:{" "}
                {table.current === table.baseline
                  ? "내용 변경"
                  : `${table.current}개 → ${table.baseline}개`}
              </Typography>
            ))}
        </div>
      ) : null}
      <TalentCareerModal
        open={confirming}
        onClose={() => {
          if (!pending) setConfirming(false);
        }}
        title="고정 상태로 되돌릴까요?"
        description={`${CAREER_CHECKPOINT_LABEL} 이후 변경 사항을 삭제합니다.`}
        closeOnBackdrop={!pending}
        showCloseButton={!pending}
        panelClassName="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <MuteButton onClick={() => setConfirming(false)} disabled={pending}>
              취소
            </MuteButton>
            <MuteButton
              variant="warn"
              disabled={pending || busy}
              onClick={() => void restore()}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {pending ? "복원 중…" : "전체 되돌리기"}
            </MuteButton>
          </div>
        }
      >
        <Typography variant="description">
          다른 탭·기기의 작업을 종료해 주세요.
        </Typography>
        {error ? (
          <Typography
            variant="caption"
            className="mt-3 text-critical"
            role="alert"
          >
            {error}
          </Typography>
        ) : null}
      </TalentCareerModal>
    </section>
  );
}
