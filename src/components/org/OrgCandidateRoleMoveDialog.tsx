import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Radio } from "@/components/ui/radio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgBoard } from "@/hooks/org/useOrg";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  candidateRoleMoveMode,
  candidateRoleMoveError,
  type CandidateRoleMoveInput,
  type CandidateRoleMoveResponse,
} from "@/lib/org/candidateRoleMove";
import type {
  OrgRole,
  OrgStageId,
  OrgTalentDetailResponse,
} from "@/lib/org/server";
import type { OrgTalentSelection } from "@/hooks/org/useOrgJobsRoute";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/cn";

export function OrgCandidateRoleMoveDialog({
  detail,
  roles,
  onClose,
  onMoved,
}: {
  detail: OrgTalentDetailResponse;
  roles: OrgRole[];
  onClose: () => void;
  onMoved: (selection: OrgTalentSelection) => void;
}) {
  const { c, locale } = useOrgLocale();
  const formId = useId();
  const queryClient = useQueryClient();
  const mode = candidateRoleMoveMode(detail.recommendation.stage);
  const [targetRoleId, setTargetRoleId] = useState("");
  const defaultStage =
    mode === "proposal"
      ? "company_intro"
      : mode === "pending"
        ? "pending_connection"
        : "connected";
  const [targetStageId, setTargetStageId] = useState<OrgStageId>(defaultStage);
  const [method, setMethod] = useState<"ask_candidate" | "direct">(
    "ask_candidate"
  );
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const targetRole = roles.find((role) => role.roleId === targetRoleId);
  const options = roles.filter(
    (role) =>
      role.roleId !== detail.role.roleId &&
      ["active", "open", "top_priority", "paused"].includes(role.status ?? "")
  );
  const board = useOrgBoard({
    workspaceId: detail.workspace.workspaceId,
    roleId: targetRoleId,
    enabled: Boolean(targetRoleId),
  });
  const stages =
    board.data?.stages.filter(
      (stage) =>
        stage.id === "connected" ||
        stage.id === "final_offer" ||
        stage.id.startsWith("custom:")
    ) ?? [];
  const alreadyPresent = board.data?.items.some(
    (item) =>
      item.talentId === detail.talent.userId &&
      !["archived", "process_stopped"].includes(item.stage)
  );
  const mutation = useMutation({
    mutationFn: (input: CandidateRoleMoveInput) =>
      fetchWithInternalAuth<CandidateRoleMoveResponse>(
        "/api/org/candidate-role",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      ),
  });
  const pending = mutation.isPending;
  const formDisabled = pending || uncertain;
  const edited = () => {
    setError("");
    setRequestId(crypto.randomUUID());
  };
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.org.boardAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.org.acceptedAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.org.detailAll }),
    ]);
  const submit = async () => {
    setError("");
    try {
      const result = await mutation.mutateAsync({
        workspaceId: detail.workspace.workspaceId,
        talentId: detail.talent.userId,
        sourceRoleId: detail.role.roleId,
        recommendationId: detail.recommendation.recommendationId,
        expectedStage: detail.recommendation.stage,
        targetRoleId,
        targetStageId,
        requestId,
        method: mode === "proposal" ? "direct" : method,
        confirmedDirectly: method === "direct",
      });
      setUncertain(false);
      if (result.status === "requested") {
        setRequested(true);
        void refresh();
        return;
      }
      if (result.status !== "moved" || !result.targetRecommendationId) {
        setError(candidateRoleMoveError(result.status, locale === "en"));
        return;
      }
      void refresh();
      onMoved({
        workspaceId: detail.workspace.workspaceId,
        talentId: detail.talent.userId,
        roleId: targetRoleId,
        recommendationId: result.targetRecommendationId,
      });
    } catch {
      setUncertain(true);
      setError(
        c(
          "처리 결과를 확인하지 못했어요. 다시 시도해 주세요.",
          "Couldn’t confirm the result. Please retry."
        )
      );
    }
  };
  const canSubmit = Boolean(
    targetRoleId &&
    board.isSuccess &&
    !alreadyPresent &&
    (mode !== "pipeline" ||
      stages.some((stage) => stage.id === targetStageId))
  );
  const stageLabel = (id: string, label: string) =>
    id === "connected"
      ? c("연결됨", "Connected")
      : id === "final_offer"
        ? c("최종 오퍼", "Final offer")
        : label;
  return (
    <TalentCareerModal
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      closeOnBackdrop={!pending}
      showCloseButton={!pending}
      title={c("다른 Role로 이동", "Move to another role")}
      description={
        <span className="block truncate text-[13px] text-neutral-muted">
          {detail.talent.name ?? c("후보자", "Candidate")} · {detail.role.name}
        </span>
      }
      panelClassName="max-w-lg border-neutral-1000-a05 bg-bg-floating"
      headerClassName="bg-bg-floating px-5 pb-5 pt-6 sm:px-6"
      bodyClassName="max-h-[calc(100dvh-176px)] overflow-y-auto px-5 pb-5 sm:px-6"
      footerClassName="border-t border-neutral-1000-a05 bg-bg-floating px-5 py-4 sm:px-6"
      mobileBottomSheet
      footer={
        <div className="flex items-center justify-end gap-2">
          {requested || mode === "waiting" ? (
            <MuteButton onClick={onClose}>{c("닫기", "Close")}</MuteButton>
          ) : (
            <>
              <MuteButton onClick={onClose} disabled={pending}>
                {c("취소", "Cancel")}
              </MuteButton>
              <MuteButton
                type="submit"
                form={formId}
                variant="primary"
                disabled={pending || (!uncertain && !canSubmit)}
              >
                {pending
                  ? c("처리 중…", "Working…")
                  : uncertain
                    ? c("다시 시도", "Retry")
                    : mode !== "proposal" && method === "ask_candidate"
                      ? c("Harper에게 확인 요청", "Ask Harper")
                      : c("이동하기", "Move candidate")}
              </MuteButton>
            </>
          )}
        </div>
      }
    >
      {requested ? (
        <div role="status" className="space-y-3 py-2 text-[13px] leading-6">
          <div className="flex items-center gap-2 font-medium">
            <Check aria-hidden className="size-4 text-positive" />
            {c("확인을 요청했어요", "Request submitted")}
          </div>
          <p className="text-neutral-muted">
            {c(
              `후보자가 수락하면 ${targetRole?.name}로 이동해요. 답변 전까지 현재 Role을 유지해요.`,
              `If the candidate accepts, they’ll move to ${targetRole?.name}. They’ll stay in the current role until then.`
            )}
          </p>
        </div>
      ) : mode === "waiting" ? (
        <p className="text-[13px] leading-6 text-neutral-muted">
          {c(
            "제안에 대한 답변을 기다리고 있어요. 답변을 받은 뒤 Role을 옮길 수 있어요.",
            "An intro is awaiting a response. You can move this candidate after they respond."
          )}
        </p>
      ) : (
        <form
          id={formId}
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending && (canSubmit || uncertain)) void submit();
          }}
        >
          <fieldset disabled={formDisabled} className="space-y-4">
            <div className="space-y-2">
              <label id={`${formId}-role`} className="text-[13px] font-medium">
                {c("이동할 Role", "Destination role")}
              </label>
              <Select
                value={targetRoleId}
                disabled={formDisabled}
                onValueChange={(value) => {
                  setTargetRoleId(value ?? "");
                  setTargetStageId(defaultStage);
                  edited();
                }}
                items={options.map((role) => ({
                  value: role.roleId,
                  label: role.name,
                }))}
              >
                <SelectTrigger aria-labelledby={`${formId}-role`}>
                  <SelectValue placeholder={c("Role 선택", "Select a role")} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((role) => (
                    <SelectItem key={role.roleId} value={role.roleId}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mode === "pipeline" &&
              targetRoleId &&
              board.isSuccess &&
              !alreadyPresent && (
                <div className="space-y-2">
                  <label
                    id={`${formId}-stage`}
                    className="text-[13px] font-medium"
                  >
                    {c("이동 후 단계", "Destination stage")}
                  </label>
                  <Select
                    value={targetStageId}
                    disabled={formDisabled}
                    onValueChange={(value) => {
                      if (value) {
                        setTargetStageId(value as OrgStageId);
                        edited();
                      }
                    }}
                    items={stages.map((stage) => ({
                      value: stage.id,
                      label: stageLabel(stage.id, stage.label),
                    }))}
                  >
                    <SelectTrigger aria-labelledby={`${formId}-stage`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stageLabel(stage.id, stage.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
          </fieldset>
          {mode !== "proposal" ? (
            <fieldset
              disabled={formDisabled}
              className="space-y-1"
              aria-label={c("이동 방법", "Move method")}
            >
              {(
                [
                  [
                    "ask_candidate",
                    c("Harper가 물어보기", "Ask through Harper"),
                    c(
                      "후보자가 수락하면 선택한 Role로 바로 옮겨요.",
                      "Move automatically if the candidate accepts."
                    ),
                  ],
                  [
                    "direct",
                    c("직접 대화했어요", "Already discussed"),
                    c(
                      "후보자와 합의한 내용대로 지금 옮겨요.",
                      "Move now, as agreed with the candidate."
                    ),
                  ],
                ] as const
              ).map(([value, label, description]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-3 transition-colors focus-within:ring-2 focus-within:ring-neutral-1000-a10",
                    method === value ? "bg-bg-weak" : "hover:bg-bg-weak",
                    formDisabled && "cursor-not-allowed opacity-60"
                  )}
                >
                  <Radio
                    name={`${formId}-method`}
                    value={value}
                    size="medium"
                    checked={method === value}
                    onChange={() => {
                      setMethod(value);
                      edited();
                    }}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">
                      {label}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-5 text-neutral-muted">
                      {description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="text-[12px] leading-5 text-neutral-muted">
              {c(
                "새 Role의 제안 목록으로 옮겨요. 후보자에게 제안을 보내지는 않아요.",
                "Move to this role’s suggested candidates. No proposal is sent to the candidate."
              )}
            </p>
          )}
          {mode === "pipeline" && (
            <p className="text-[12px] leading-5 text-neutral-muted">
              {c(
                "기존 연락과 인터뷰 일정은 그대로 유지돼요.",
                "Existing messages and interview arrangements stay unchanged."
              )}
            </p>
          )}
          {!options.length && (
            <p className="text-[12px] text-neutral-muted">
              {c(
                "이동할 수 있는 다른 Role이 없어요.",
                "No other roles are available."
              )}
            </p>
          )}
          {targetRoleId && board.isPending && (
            <p className="text-[12px] text-neutral-muted">
              {c("Role을 확인하고 있어요…", "Loading role…")}
            </p>
          )}
          {board.isError && (
            <p role="alert" className="text-[12px] text-critical">
              {c("Role 정보를 불러오지 못했어요.", "Couldn’t load this role.")}{" "}
              <MuteButton
                variant="transparent"
                onClick={() => void board.refetch()}
              >
                {c("다시 시도", "Retry")}
              </MuteButton>
            </p>
          )}
          {alreadyPresent && (
            <p role="alert" className="text-[12px] text-critical">
              {c(
                "이 Role에서 이미 진행 중인 후보예요.",
                "This candidate is already in this role."
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="text-[12px] leading-5 text-critical">
              {error}
            </p>
          )}
        </form>
      )}
    </TalentCareerModal>
  );
}
