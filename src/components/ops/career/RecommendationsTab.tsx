import { memo, useCallback, useMemo, useState } from "react";
import {
  ExternalLink,
  FileText,
  LoaderCircle,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { cx, opsTheme } from "@/components/ops/theme";
import { Tooltips } from "@/components/ui/tooltip";
import {
  useOpsCareerRecommendations,
  useOpsManualInternalRecommendationRoles,
  useQueueOpsManualInternalRecommendation,
  useUpdateOpsCareerRecommendationStage,
} from "@/hooks/ops/useOpsCareer";
import type {
  CareerTalentRecommendationItem,
  OpsManualInternalRecommendationRole,
} from "@/lib/ops/careerServer";
import {
  AUTO_RECOMMENDATION_STAGE_VALUE,
  CUSTOM_RECOMMENDATION_STAGE_VALUE,
  INTERNAL_RECOMMENDATION_FIXED_STAGES,
  RECOMMENDATION_SOURCE_FILTER_OPTIONS,
  type RecommendationSourceFilter,
  formatKst,
  getAutoRecommendationStageLabel,
  getRecommendationStageSelectValue,
  recommendationFeedbackClass,
  recommendationFeedbackLabel,
  recommendationSourceClass,
  recommendationSourceLabel,
} from "./utils";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { Select as UiSelect } from "@/components/ui/select";
import { Radio as UiRadio } from "@/components/ui/radio";

type ManualInternalRecommendationModalProps = {
  fixedRole?: OpsManualInternalRecommendationRole | null;
  onClose: () => void;
  onQueued: (result: {
    role: OpsManualInternalRecommendationRole;
    runId: string;
  }) => void;
  open: boolean;
  userId: string;
};

export function ManualInternalRecommendationModal({
  fixedRole = null,
  onClose,
  onQueued,
  open,
  userId,
}: ManualInternalRecommendationModalProps) {
  const [roleSearch, setRoleSearch] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [error, setError] = useState("");
  const rolesQuery = useOpsManualInternalRecommendationRoles(
    roleSearch,
    40,
    open && !fixedRole,
    userId
  );
  const queueRecommendation = useQueueOpsManualInternalRecommendation();

  const resetModalState = useCallback(() => {
    setRoleSearch("");
    setSelectedRoleId(null);
    setReason("");
    setReasonModalOpen(false);
    setError("");
  }, []);

  const handleClose = useCallback(() => {
    resetModalState();
    onClose();
  }, [onClose, resetModalState]);

  const roles = fixedRole ? [fixedRole] : (rolesQuery.data?.roles ?? []);
  const selectedRole =
    fixedRole ?? roles.find((role) => role.roleId === selectedRoleId) ?? null;
  const selectedDescriptionSummary = selectedRole?.descriptionSummary?.trim();
  const selectedDescription = selectedRole?.description?.trim();
  const showSelectedDescription =
    selectedDescription && selectedDescription !== selectedDescriptionSummary;
  const canOpenReason = Boolean(selectedRole) && !queueRecommendation.isPending;
  const canSubmit = Boolean(selectedRole) && !queueRecommendation.isPending;

  const handleOpenReasonModal = useCallback(() => {
    if (!selectedRole || !canOpenReason) return;
    setError("");
    setReasonModalOpen(true);
  }, [canOpenReason, selectedRole]);

  const handleReasonClose = useCallback(() => {
    if (queueRecommendation.isPending) return;
    setError("");
    setReasonModalOpen(false);
  }, [queueRecommendation.isPending]);

  const handleSubmit = useCallback(async () => {
    if (!selectedRole || !canSubmit) return;
    setError("");
    try {
      const result = await queueRecommendation.mutateAsync({
        reason: reason.trim() || null,
        roleId: selectedRole.roleId,
        userId,
      });
      onQueued({
        role: result.role,
        runId: result.run.id,
      });
      handleClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "추천 등록에 실패했습니다."
      );
    }
  }, [
    canSubmit,
    handleClose,
    onQueued,
    queueRecommendation,
    reason,
    selectedRole,
    userId,
  ]);

  return (
    <>
      <TalentCareerModal
        open={open && !reasonModalOpen}
        onClose={handleClose}
        title="Internal 추천 등록"
        panelClassName="flex h-[760px] max-h-[88vh] max-w-[1120px] flex-col border border-neutral-1000-a05 bg-bg-default"
        headerClassName="shrink-0 border-b border-neutral-1000-a05 bg-bg-default pr-16"
        bodyClassName="min-h-0 flex-1 overflow-hidden bg-bg-default p-0"
        footerClassName="shrink-0 border-t border-neutral-1000-a05 bg-bg-default"
        closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-default/70 text-neutral-muted transition-colors hover:border-neutral-1000-a10 hover:text-neutral-primary"
        footer={
          <div className="flex items-center justify-end gap-2">
            <BareButton
              type="button"
              onClick={handleClose}
              className={cx(opsTheme.buttonSecondary, "h-9 px-4 text-xs")}
            >
              취소
            </BareButton>
            <BareButton
              type="button"
              onClick={handleOpenReasonModal}
              disabled={!canOpenReason}
              className={cx(
                opsTheme.buttonPrimary,
                "h-9 px-4 text-xs",
                !canOpenReason && "cursor-not-allowed opacity-50"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              등록
            </BareButton>
          </div>
        }
      >
        <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,0.85fr)_minmax(360px,0.85fr)] lg:overflow-hidden">
          <div className="flex min-w-0 flex-col border-b border-neutral-1000-a05 lg:border-b-0 lg:border-r">
            <div className="border-b border-neutral-1000-a05 px-5 py-4">
              <label className="block">
                <span className={opsTheme.label}>Internal role</span>
                {fixedRole ? (
                  <div className="mt-2 rounded-md border border-neutral-1000-a05 bg-bg-default/70 px-3 py-2 text-sm text-neutral-primary">
                    {fixedRole.companyName} · {fixedRole.roleName}
                  </div>
                ) : (
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                    <UiInput
                      unstyled
                      type="text"
                      value={roleSearch}
                      onChange={(event) => setRoleSearch(event.target.value)}
                      placeholder="회사, role, location 검색"
                      className={cx(opsTheme.input, "h-10 pl-9 text-sm")}
                    />
                  </div>
                )}
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              {rolesQuery.isLoading ? (
                <div className="flex h-full min-h-[280px] items-center justify-center">
                  <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
                </div>
              ) : rolesQuery.error ? (
                <div className={opsTheme.errorNotice}>
                  {rolesQuery.error instanceof Error
                    ? rolesQuery.error.message
                    : "Internal role을 불러오지 못했습니다."}
                </div>
              ) : roles.length === 0 ? (
                <div className="flex h-full min-h-[280px] items-center justify-center rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating text-sm text-neutral-soft">
                  선택 가능한 internal role이 없습니다.
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-neutral-1000-a05 bg-bg-default/55">
                  <div className="max-h-[440px] overflow-auto">
                    <table className="w-full min-w-[800px] table-fixed border-collapse text-xs">
                      <thead className="sticky top-0 z-[1] bg-bg-weak text-left text-neutral-muted">
                        <tr>
                          <th className="w-[24px] px-3 py-2 font-medium">
                            <span className="sr-only"></span>
                          </th>
                          <th className="w-[140px] px-3 py-2 font-medium">
                            회사
                          </th>
                          <th className="px-3 py-2 font-medium">역할</th>
                          <th className="w-[180px] px-3 py-2 font-medium">
                            Location
                          </th>
                          <th className="w-[96px] px-3 py-2 font-medium">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-1000-a05">
                        {roles.map((role) => {
                          const active = selectedRole?.roleId === role.roleId;
                          return (
                            <tr
                              key={role.roleId}
                              role="button"
                              tabIndex={0}
                              aria-pressed={active}
                              onClick={() => setSelectedRoleId(role.roleId)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  setSelectedRoleId(role.roleId);
                                }
                              }}
                              className={cx(
                                "cursor-pointer align-top transition hover:opacity-80",
                                active
                                  ? "bg-black text-neutral-00"
                                  : "text-neutral-muted"
                              )}
                            >
                              <td className="px-3 py-3 align-top">
                                {role.alreadyRecommended ? (
                                  <Tooltips text="이 역할은 이미 추천되었습니다.">
                                    <span
                                      role="img"
                                      aria-label="이미 추천되었습니다."
                                      title="이미 추천되었습니다."
                                      className="mt-1 inline-flex h-2 w-2 rounded-full bg-positive ring-2 ring-positive/30"
                                    />
                                  </Tooltips>
                                ) : null}
                              </td>
                              <td
                                className={cx(
                                  "truncate px-3 py-3 align-top font-medium",
                                  active
                                    ? "text-neutral-00"
                                    : "text-neutral-muted"
                                )}
                                title={role.companyName}
                              >
                                {role.companyName}
                              </td>
                              <td
                                className={cx(
                                  "truncate px-3 py-3 align-top text-[13px] font-normal",
                                  active
                                    ? "text-neutral-00"
                                    : "text-neutral-primary"
                                )}
                                title={role.roleName}
                              >
                                {role.roleName}
                              </td>
                              <td
                                className={cx(
                                  "truncate px-3 py-3 align-top",
                                  active
                                    ? "text-neutral-00/70"
                                    : "text-neutral-muted"
                                )}
                                title={role.locationText ?? undefined}
                              >
                                {role.locationText || "-"}
                              </td>
                              <td className="px-3 py-3 align-top">
                                <span
                                  className={cx(
                                    "inline-flex max-w-full items-center truncate rounded border px-1 text-[11px] font-medium",
                                    active
                                      ? "border-neutral-00/25 bg-neutral-00/10 text-neutral-00"
                                      : "border-neutral-1000-a05 bg-bg-default/75 text-neutral-muted"
                                  )}
                                >
                                  {role.status ?? "active"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col bg-bg-weak px-5 py-5">
            {selectedRole ? (
              <>
                <div>
                  <div className="text-base font-medium text-neutral-primary">
                    {selectedRole.roleName}
                  </div>
                  <div className="mt-1 text-sm text-neutral-primary">
                    {selectedRole.companyName}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-muted">
                    <div className="min-w-0 truncate">
                      {selectedRole.locationText || "Location 없음"}
                    </div>
                    <div className="min-w-0 truncate text-right">
                      {formatKst(selectedRole.updatedAt)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 min-h-0 flex-1 overflow-y-auto text-sm leading-6 text-neutral-primary pb-4">
                  {selectedDescriptionSummary ? (
                    <div className="whitespace-pre-wrap break-words font-medium text-neutral-primary">
                      {selectedDescriptionSummary}
                    </div>
                  ) : null}
                  {showSelectedDescription ? (
                    <div
                      className={cx(
                        "whitespace-pre-wrap break-words",
                        selectedDescriptionSummary && "mt-4 text-neutral-muted"
                      )}
                    >
                      {selectedDescription}
                    </div>
                  ) : null}
                  {!selectedDescriptionSummary && !showSelectedDescription ? (
                    <div className="text-neutral-soft">
                      이 role에는 아직 description이 없습니다.
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mt-3 flex flex-1 items-center justify-center rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating p-6 text-center text-sm text-neutral-soft">
                왼쪽 테이블에서 role을 선택하면 상세 description이 여기에
                표시됩니다.
              </div>
            )}
          </aside>
        </div>
      </TalentCareerModal>

      <TalentCareerModal
        open={open && reasonModalOpen}
        onClose={handleReasonClose}
        title="추천 이유 입력"
        description="추천 이유를 작성해주세요. 작성하지 않거나 대충 작성하더라도 Harper가 알아서 잘 작성해서 추천하게 됩니다."
        panelClassName="max-w-[560px] border border-neutral-1000-a05 bg-bg-default"
        headerClassName="border-b border-neutral-1000-a05 bg-bg-default pr-16"
        bodyClassName="bg-bg-default p-5"
        footerClassName="border-t border-neutral-1000-a05 bg-bg-default"
        closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-default/70 text-neutral-muted transition-colors hover:border-neutral-1000-a10 hover:text-neutral-primary"
        footer={
          <div className="flex items-center justify-end gap-2">
            <BareButton
              type="button"
              onClick={handleReasonClose}
              disabled={queueRecommendation.isPending}
              className={cx(
                opsTheme.buttonSecondary,
                "h-9 px-4 text-xs",
                queueRecommendation.isPending && "cursor-not-allowed opacity-50"
              )}
            >
              이전
            </BareButton>
            <BareButton
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className={cx(
                opsTheme.buttonPrimary,
                "h-9 px-4 text-xs",
                !canSubmit && "cursor-not-allowed opacity-50"
              )}
            >
              {queueRecommendation.isPending ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              제출
            </BareButton>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedRole ? (
            <div className="">
              <div className="text-sm font-medium text-neutral-primary">
                {selectedRole.roleName}
              </div>
              <div className="mt-1 text-xs text-neutral-muted">
                {selectedRole.companyName}
              </div>
            </div>
          ) : null}

          <label className="block">
            <span className={opsTheme.label}>추천 이유 (optional)</span>
            <UiTextarea
              unstyled
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="예: 최근 agent workflow 경험과 잘 맞고, Harper가 직접 연결할 수 있는 팀이라 우선 제안하고 싶음"
              className={cx(opsTheme.textarea, "mt-2 min-h-[180px] resize-y")}
              maxLength={2000}
            />
          </label>

          {error ? <div className={opsTheme.errorNotice}>{error}</div> : null}
        </div>
      </TalentCareerModal>
    </>
  );
}

type RecommendationRowProps = {
  customDraft: string;
  isCustomOpen: boolean;
  isSaving: boolean;
  item: CareerTalentRecommendationItem;
  onCustomDraftChange: (recommendationId: string, value: string) => void;
  onCustomSave: (item: CareerTalentRecommendationItem) => void;
  onStageSelect: (item: CareerTalentRecommendationItem, value: string) => void;
  selectValue: string;
};

const RecommendationRow = memo(function RecommendationRow({
  customDraft,
  isCustomOpen,
  isSaving,
  item,
  onCustomDraftChange,
  onCustomSave,
  onStageSelect,
  selectValue,
}: RecommendationRowProps) {
  const isInternal = item.sourceType === "internal";

  return (
    <tr className="text-neutral-muted transition hover:bg-bg-default/70">
      <td className="px-2 py-2 align-top text-neutral-muted">
        {formatKst(item.recommendedAt)}
      </td>
      <td className="px-2 py-2 align-top">
        <span
          className={cx(
            "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
            recommendationSourceClass(item.sourceType)
          )}
        >
          {recommendationSourceLabel(item.sourceType)}
        </span>
      </td>
      <td className="px-2 py-2 align-top">
        <div className="min-w-0">
          <div
            className="truncate font-medium text-neutral-primary"
            title={item.roleName}
          >
            {item.roleName}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-muted">
            <span className="truncate" title={item.companyName}>
              {item.companyName}
            </span>
            {item.externalJdUrl ? (
              <a
                href={item.externalJdUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-neutral-muted transition hover:text-neutral-primary"
                title="JD 열기"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          {item.locationText ? (
            <div className="mt-0.5 truncate text-[11px] text-neutral-soft">
              {item.locationText}
            </div>
          ) : null}
        </div>
      </td>
      <td className="px-2 py-2 align-top text-[11px]">
        <div
          className={cx(
            item.viewedAt ? "text-neutral-muted" : "text-neutral-soft"
          )}
        >
          {item.viewedAt ? `열람 ${formatKst(item.viewedAt)}` : "미열람"}
        </div>
        <div
          className={cx(
            "mt-0.5",
            item.clickedAt ? "text-neutral-muted" : "text-neutral-soft"
          )}
        >
          {item.clickedAt ? `클릭 ${formatKst(item.clickedAt)}` : "미클릭"}
        </div>
      </td>
      <td className="px-2 py-2 align-top">
        <span
          className={cx(
            "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
            recommendationFeedbackClass(item.feedback)
          )}
        >
          {recommendationFeedbackLabel(item.feedback)}
        </span>
        {item.feedbackAt ? (
          <div className="mt-1 text-[11px] text-neutral-soft">
            {formatKst(item.feedbackAt)}
          </div>
        ) : null}
        {item.feedbackReason ? (
          <div
            className="mt-0.5 truncate text-[11px] text-neutral-muted"
            title={item.feedbackReason}
          >
            {item.feedbackReason}
          </div>
        ) : null}
      </td>
      <td className="px-2 py-2 align-top">
        {isInternal ? (
          <div className="space-y-1.5">
            <UiSelect
              unstyled
              value={selectValue}
              onChange={(event) => onStageSelect(item, event.target.value)}
              disabled={isSaving}
              className="h-8 w-full rounded-md border border-neutral-1000-a05 bg-bg-default/80 px-2 text-xs text-neutral-primary outline-none transition focus:border-neutral-1000-a10 disabled:opacity-50"
            >
              <option value={AUTO_RECOMMENDATION_STAGE_VALUE}>
                {getAutoRecommendationStageLabel(item)}
              </option>
              {INTERNAL_RECOMMENDATION_FIXED_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
              <option value={CUSTOM_RECOMMENDATION_STAGE_VALUE}>
                기타(주관식)
              </option>
            </UiSelect>
            {isCustomOpen ? (
              <div className="flex items-center gap-1.5">
                <UiInput
                  unstyled
                  type="text"
                  value={customDraft}
                  onChange={(event) =>
                    onCustomDraftChange(
                      item.recommendationId,
                      event.target.value
                    )
                  }
                  placeholder="상태 입력"
                  className="h-8 min-w-0 flex-1 rounded-md border border-neutral-1000-a05 bg-bg-default/80 px-2 text-xs text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-1000-a10"
                />
                <BareButton
                  type="button"
                  onClick={() => onCustomSave(item)}
                  disabled={isSaving || !customDraft.trim()}
                  className={cx(opsTheme.buttonSecondary, "h-8 px-2 text-xs")}
                >
                  {isSaving ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                </BareButton>
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-neutral-muted">{item.effectiveStage}</span>
        )}
      </td>
    </tr>
  );
});

type RecommendationsTabProps = {
  userId: string;
};

export const RecommendationsTab = memo(function RecommendationsTab({
  userId,
}: RecommendationsTabProps) {
  const [sourceFilter, setSourceFilter] =
    useState<RecommendationSourceFilter>("all");
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOpsCareerRecommendations(userId, 20, true, sourceFilter);
  const updateStage = useUpdateOpsCareerRecommendationStage();
  const [customOpenIds, setCustomOpenIds] = useState<Set<string>>(
    () => new Set()
  );
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [stageError, setStageError] = useState("");
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualNotice, setManualNotice] = useState("");

  const recommendations = useMemo(
    () => data?.pages.flatMap((page) => page.recommendations) ?? [],
    [data]
  );
  const emptyRecommendationMessage =
    sourceFilter === "internal"
      ? "연결된 Internal 기회가 없습니다."
      : "저장된 추천 기록이 없습니다.";

  const saveStage = useCallback(
    async (
      item: CareerTalentRecommendationItem,
      processedStage: string | null
    ) => {
      if (item.sourceType !== "internal") return;
      setSavingId(item.recommendationId);
      setStageError("");
      try {
        await updateStage.mutateAsync({
          processedStage,
          recommendationId: item.recommendationId,
          userId,
        });
      } catch (stageUpdateError) {
        setStageError(
          stageUpdateError instanceof Error
            ? stageUpdateError.message
            : "추천 상태를 저장하지 못했습니다."
        );
      } finally {
        setSavingId(null);
      }
    },
    [updateStage, userId]
  );

  const closeCustomEditor = useCallback((recommendationId: string) => {
    setCustomOpenIds((prev) => {
      const next = new Set(prev);
      next.delete(recommendationId);
      return next;
    });
  }, []);

  const openCustomEditor = useCallback(
    (item: CareerTalentRecommendationItem) => {
      setCustomOpenIds((prev) => {
        const next = new Set(prev);
        next.add(item.recommendationId);
        return next;
      });
      setCustomDrafts((prev) => ({
        ...prev,
        [item.recommendationId]:
          prev[item.recommendationId] ?? item.processedStage ?? "",
      }));
    },
    []
  );

  const handleStageSelect = useCallback(
    async (item: CareerTalentRecommendationItem, value: string) => {
      if (value === CUSTOM_RECOMMENDATION_STAGE_VALUE) {
        openCustomEditor(item);
        return;
      }

      closeCustomEditor(item.recommendationId);
      await saveStage(
        item,
        value === AUTO_RECOMMENDATION_STAGE_VALUE ? null : value
      );
    },
    [closeCustomEditor, openCustomEditor, saveStage]
  );

  const handleCustomSave = useCallback(
    async (item: CareerTalentRecommendationItem) => {
      const draft = (customDrafts[item.recommendationId] ?? "").trim();
      if (!draft) return;
      await saveStage(item, draft);
      closeCustomEditor(item.recommendationId);
    },
    [closeCustomEditor, customDrafts, saveStage]
  );

  const handleCustomDraftChange = useCallback(
    (recommendationId: string, value: string) => {
      setCustomDrafts((prev) => ({
        ...prev,
        [recommendationId]: value,
      }));
    },
    []
  );

  const handleManualQueued = useCallback(
    ({
      role,
      runId,
    }: {
      role: OpsManualInternalRecommendationRole;
      runId: string;
    }) => {
      setManualNotice(
        `${role.roleName} at ${role.companyName} 추천 run을 등록했습니다. (${runId})`
      );
    },
    []
  );

  return (
    <div className={cx(opsTheme.panelSoft, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className={opsTheme.eyebrow}>Recommendations</div>
          <div className="mt-1 text-xs text-neutral-muted">
            Internal / External 추천 기록, 열람, 클릭, 피드백, 진행 상태
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BareButton
            type="button"
            onClick={() => {
              setManualNotice("");
              setManualModalOpen(true);
            }}
            className={cx(opsTheme.buttonPrimary, "h-8 px-3 text-xs")}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Internal 추천 등록
          </BareButton>
          <div
            role="radiogroup"
            aria-label="추천 표시 범위"
            className="flex items-center gap-1.5 rounded-md border border-neutral-1000-a05 bg-bg-default/55 px-2 py-1 text-[11px] text-neutral-muted"
          >
            {RECOMMENDATION_SOURCE_FILTER_OPTIONS.map((option) => (
              <label
                key={option.id}
                className={cx(
                  "inline-flex h-6 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded px-1 transition",
                  sourceFilter === option.id
                    ? "text-neutral-primary"
                    : "hover:text-neutral-muted"
                )}
              >
                <UiRadio
                  unstyled
                  name={`recommendation-source-filter-${userId}`}
                  value={option.id}
                  checked={sourceFilter === option.id}
                  onChange={() => setSourceFilter(option.id)}
                  className="h-3 w-3 accent-black"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {stageError ? (
        <div className={cx(opsTheme.errorNotice, "mt-4")}>{stageError}</div>
      ) : null}
      {manualNotice ? (
        <div className={cx(opsTheme.successNotice, "mt-4")}>{manualNotice}</div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : error ? (
        <div className={cx(opsTheme.errorNotice, "mt-4")}>
          {error instanceof Error
            ? error.message
            : "추천 기록을 불러오지 못했습니다."}
        </div>
      ) : recommendations.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-6 text-center text-sm text-neutral-soft">
          {emptyRecommendationMessage}
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-md border border-neutral-1000-a05 bg-bg-default/55">
            <table className="min-w-[1080px] w-full table-fixed border-collapse text-xs">
              <thead className="bg-bg-weak text-left text-neutral-muted">
                <tr>
                  <th className="w-[135px] px-2 py-2 font-medium">추천일</th>
                  <th className="w-[90px] px-2 py-2 font-medium">구분</th>
                  <th className="px-2 py-2 font-medium">회사 / 역할</th>
                  <th className="w-[150px] px-2 py-2 font-medium">
                    열람 / 클릭
                  </th>
                  <th className="w-[150px] px-2 py-2 font-medium">피드백</th>
                  <th className="w-[230px] px-2 py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-1000-a05">
                {recommendations.map((item) => {
                  const selectValue = getRecommendationStageSelectValue(item);
                  const isSavedCustom =
                    selectValue === CUSTOM_RECOMMENDATION_STAGE_VALUE &&
                    Boolean(item.processedStage?.trim());
                  const isCustomOpen =
                    item.sourceType === "internal" &&
                    (customOpenIds.has(item.recommendationId) || isSavedCustom);
                  const customDraft =
                    customDrafts[item.recommendationId] ??
                    item.processedStage ??
                    "";

                  return (
                    <RecommendationRow
                      key={item.recommendationId}
                      customDraft={customDraft}
                      isCustomOpen={isCustomOpen}
                      isSaving={savingId === item.recommendationId}
                      item={item}
                      onCustomDraftChange={handleCustomDraftChange}
                      onCustomSave={handleCustomSave}
                      onStageSelect={handleStageSelect}
                      selectValue={selectValue}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <BareButton
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className={cx(opsTheme.buttonSecondary, "h-9 px-4 text-xs")}
              >
                {isFetchingNextPage ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    불러오는 중...
                  </>
                ) : (
                  "20개 더 보기"
                )}
              </BareButton>
            </div>
          ) : null}
        </>
      )}

      <ManualInternalRecommendationModal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        userId={userId}
        onQueued={handleManualQueued}
      />
    </div>
  );
});
