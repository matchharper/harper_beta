import { useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { useOrgDocumentEditorCopy } from "@/i18n/org/useOrgDocumentEditorCopy";
import { BadgeCheck, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { OrgSection } from "@/components/org/workspace/OrgSection";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { MuteButton } from "@/components/ui/button";
import { DocumentEditor } from "@/components/ui/document-editor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useUnsavedChangesWarning } from "@/hooks/org/useUnsavedChangesWarning";
import { createOrgEditingDismissHandlers } from "@/lib/org/editingInteraction";
import {
  getOrgRoleCriteriaValidationError,
  normalizeOrgRoleCriteria,
  ORG_ROLE_CRITERIA_MAX_ITEMS,
  ORG_ROLE_CRITERIA_MIN_ITEMS,
  type OrgRoleCriterion,
} from "@/lib/org/roleCriteria";
import type { OrgRole } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";
import {
  getRoleOverviewErrorMessage,
  RoleSectionHeading,
} from "./RoleOverviewShared";
import { OrgRoleCalibrationSection } from "./OrgRoleCalibrationSection";

type MatchingDraft = {
  criteria: OrgRoleCriterion[];
  request: string;
};

type MatchingEditingField = "criteria" | "request";

function toMatchingDraft(role: OrgRole): MatchingDraft {
  return {
    criteria: normalizeOrgRoleCriteria(role.criteria),
    request: role.request ?? "",
  };
}

function normalizeMatchingDraft(draft: MatchingDraft) {
  return {
    criteria: normalizeOrgRoleCriteria(draft.criteria),
    request: draft.request,
  };
}

export function OrgRoleMatchingContent({
  role,
  showBottomBorder = false,
  workspaceId,
}: {
  role: OrgRole;
  showBottomBorder?: boolean;
  workspaceId: string;
}) {
  const t = useOrgT();
  const documentEditorCopy = useOrgDocumentEditorCopy();
  const { permissions } = useOrgWorkspace();
  const canManage = permissions.canManageCandidates;
  const addToast = useToastStore((state) => state.add);
  const updateRole = useUpdateOrgRole();
  const [editingField, setEditingField] = useState<MatchingEditingField | null>(
    null
  );
  const [draft, setDraft] = useState<MatchingDraft | null>(null);
  const [saveError, setSaveError] = useState("");
  const currentDraft = draft ?? toMatchingDraft(role);
  const hasChanges =
    draft !== null &&
    JSON.stringify(normalizeMatchingDraft(draft)) !==
      JSON.stringify(normalizeMatchingDraft(toMatchingDraft(role)));

  useUnsavedChangesWarning(hasChanges);

  const changeDraft = (
    patch: Partial<MatchingDraft>,
    field: MatchingEditingField
  ) => {
    if (!canManage || updateRole.isPending) return;
    setEditingField(field);
    setSaveError("");
    setDraft((current) => ({
      ...(current ?? toMatchingDraft(role)),
      ...patch,
    }));
  };

  const startCriteriaEditing = () => {
    if (!canManage || updateRole.isPending) return;
    const nextDraft = draft ?? toMatchingDraft(role);
    const criteria = [...nextDraft.criteria];
    while (criteria.length < ORG_ROLE_CRITERIA_MIN_ITEMS) {
      criteria.push({ criteria: "", name: "" });
    }
    setDraft({ ...nextDraft, criteria });
    setSaveError("");
    setEditingField("criteria");
  };

  const changeCriterion = (index: number, patch: Partial<OrgRoleCriterion>) => {
    changeDraft(
      {
        criteria: currentDraft.criteria.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item
        ),
      },
      "criteria"
    );
  };

  const addCriterion = () => {
    if (currentDraft.criteria.length >= ORG_ROLE_CRITERIA_MAX_ITEMS) return;
    changeDraft(
      {
        criteria: [...currentDraft.criteria, { criteria: "", name: "" }],
      },
      "criteria"
    );
  };

  const removeCriterion = (index: number) => {
    if (currentDraft.criteria.length <= ORG_ROLE_CRITERIA_MIN_ITEMS) return;
    changeDraft(
      {
        criteria: currentDraft.criteria.filter(
          (_, itemIndex) => itemIndex !== index
        ),
      },
      "criteria"
    );
  };

  const cancelEditing = () => {
    if (updateRole.isPending) return;
    setDraft(null);
    setEditingField(null);
    setSaveError("");
  };

  const save = async () => {
    if (!draft || !hasChanges || updateRole.isPending) return;

    const criteria = normalizeOrgRoleCriteria(draft.criteria);
    const criteriaChanged =
      JSON.stringify(criteria) !==
      JSON.stringify(normalizeOrgRoleCriteria(role.criteria));
    if (criteriaChanged) {
      const criteriaError = getOrgRoleCriteriaValidationError(criteria);
      if (criteriaError) {
        setSaveError(criteriaError);
        setEditingField("criteria");
        addToast({ message: criteriaError, variant: "error" });
        return;
      }
    }

    setSaveError("");
    try {
      await updateRole.mutateAsync({
        ...(criteriaChanged
          ? {
              criteria,
              expectedCriteria: normalizeOrgRoleCriteria(role.criteria),
            }
          : {}),
        request: draft.request.trim() || null,
        roleId: role.roleId,
        workspaceId,
      });
      setDraft(null);
      setEditingField(null);
      addToast({
        message: t("role.overview.OrgRoleMatchingContent.8d5d739c", "정보를 저장했습니다."),
        variant: "success",
      });
    } catch (error) {
      const message = getRoleOverviewErrorMessage(
        error,
        t("role.overview.OrgRoleMatchingContent.e87c4f62", "정보를 저장하지 못했습니다.")
      );
      setSaveError(message);
      addToast({ message, variant: "error" });
    }
  };

  const editingDismissHandlers = createOrgEditingDismissHandlers({
    active: editingField !== null,
    hasChanges,
    onDismiss: cancelEditing,
    pending: updateRole.isPending,
  });

  return (
    <div {...editingDismissHandlers}>
      <OrgSection className={showBottomBorder ? "last:border-b" : undefined}>
        <div>
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <RoleSectionHeading
                size="large"
                title={t("role.overview.OrgRoleMatchingContent.69f8bc73", "Hiring Brief")}
              />
              <div className="mt-1 text-[13px] font-normal leading-5 text-black/60">
                {t("role.overview.OrgRoleMatchingContent.87feed59", "이 내용은 후보자를 탐색하고 추천할 때 내부 기준으로 사용해요. 여러 기준이 있다면 우선순위와 허용할 수 있는 tradeoff를 함께 적어 주세요.")}
                <br />
                {t("role.overview.OrgRoleMatchingContent.fee3a60b", "외부에 공개하기 어려운 내부 기준도 작성할 수 있어요.")}
              </div>
            </div>
          </div>
          <DocumentEditor
            {...documentEditorCopy}
            aria-label={t("role.overview.OrgRoleMatchingContent.86797548", "Hiring Brief 수정")}
            disabled={updateRole.isPending}
            documentTitle="Hiring Brief"
            errorMessage={editingField === "request" ? saveError : ""}
            lastChangedAt={role.updatedAt}
            onChange={(event) =>
              changeDraft({ request: event.target.value }, "request")
            }
            placeholder={t("role.overview.OrgRoleMatchingContent.0381977c", "Harper가 후보자를 탐색하고 판단할 때 알아야 할 내부 기준을 알려주세요.")}
            readOnly={!canManage}
            rows={5}
            savedValue={role.request ?? ""}
            value={currentDraft.request}
          />
        </div>
        {editingField === "request" && saveError ? (
          <div className="mt-3 text-[12px] text-critical" role="alert">
            {saveError}
          </div>
        ) : null}

        <div className="mt-20 pb-6">
          <div className="flex items-start justify-between gap-4">
            <RoleSectionHeading
              info={t("role.overview.OrgRoleMatchingContent.de6df743", "이름은 기준을 나타내고, 상세 내용에는 필요한 수준과 근거, 가산점 또는 우려 요소를 적어요. 2–4개를 권장하며 최대 6개까지 추가할 수 있어요.")}
              size="large"
              title={t("role.overview.OrgRoleMatchingContent.358e2561", "Evaluation Criteria")}
            />
            {editingField !== "criteria" ? (
              <MuteButton
                disabled={!canManage || updateRole.isPending}
                onClick={startCriteriaEditing}
                variant="transparent"
              >
                {currentDraft.criteria.length
                  ? t("role.overview.OrgRoleMatchingContent.fcb66725", "수정하기")
                  : t("role.overview.OrgRoleMatchingContent.c63bee85", "작성하기")}
              </MuteButton>
            ) : null}
          </div>

          {editingField === "criteria" ? (
            <div className="mt-4 grid gap-3" data-inline-editable-interaction>
              {currentDraft.criteria.map((item, index) => (
                <div
                  className="rounded-md bg-bg-basement p-3"
                  key={`criterion-${index}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label
                      className="text-[12px] font-medium text-neutral-primary"
                      htmlFor={`role-criterion-name-${index}`}
                    >
                      {t("role.overview.OrgRoleMatchingContent.63ca402b", "기준")}
                      {index + 1}
                    </label>
                    <MuteButton
                      aria-label={t(
                        "role.overview.OrgRoleMatchingContent.fcc2b5c5", "기준 {p0} 삭제",
                        { p0: index + 1 }
                      )}
                      disabled={
                        !canManage ||
                        currentDraft.criteria.length <=
                          ORG_ROLE_CRITERIA_MIN_ITEMS ||
                        updateRole.isPending
                      }
                      onClick={() => removeCriterion(index)}
                      size="sm"
                      variant="transparent"
                    >
                      <Trash2 className="size-3.5" />
                    </MuteButton>
                  </div>
                  <Input
                    aria-label={t(
                      "role.overview.OrgRoleMatchingContent.be42d318", "기준 {p0} 이름",
                      { p0: index + 1 }
                    )}
                    id={`role-criterion-name-${index}`}
                    onChange={(event) =>
                      changeCriterion(index, { name: event.target.value })
                    }
                    placeholder={t(
                      "role.overview.OrgRoleMatchingContent.e80f358d", "예: Experience level"
                    )}
                    value={item.name}
                  />
                  <Textarea
                    autoResize
                    aria-label={t(
                      "role.overview.OrgRoleMatchingContent.36f3b5cf", "기준 {p0} 상세 내용",
                      { p0: index + 1 }
                    )}
                    className="mt-2 min-h-[96px]"
                    onChange={(event) =>
                      changeCriterion(index, {
                        criteria: event.target.value,
                      })
                    }
                    placeholder={t(
                      "role.overview.OrgRoleMatchingContent.f02ef6d2", "필요한 수준, 판단 근거, 가산점과 우려 요소를 구체적으로 적어주세요."
                    )}
                    rows={4}
                    value={item.criteria}
                  />
                </div>
              ))}
              {currentDraft.criteria.length < ORG_ROLE_CRITERIA_MAX_ITEMS ? (
                <MuteButton
                  disabled={!canManage || updateRole.isPending}
                  onClick={addCriterion}
                  variant="transparent"
                >
                  <Plus className="size-3.5" />
                  {t("role.overview.OrgRoleMatchingContent.538986c1", "기준 추가하기")}
                </MuteButton>
              ) : null}
            </div>
          ) : currentDraft.criteria.length ? (
            <div className="mt-4 grid gap-3">
              {currentDraft.criteria.map((item, index) => (
                <div
                  className="rounded-md bg-bg-basement px-4 py-3"
                  key={`${item.name}-${index}`}
                >
                  <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
                    <BadgeCheck className="size-4 shrink-0 text-positive" />
                    <span>{item.name}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-neutral-muted">
                    {item.criteria}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-md bg-bg-basement px-4 py-3 text-[13px] leading-5 text-neutral-muted">
              {t("role.overview.OrgRoleMatchingContent.3760c5ec", "아직 Evaluation Criteria가 없어요. Harper가 역할 내용과 Hiring Brief를 바탕으로 먼저 초안을 작성합니다.")}
            </div>
          )}
          {editingField === "criteria" && saveError ? (
            <div className="mt-3 text-[12px] text-critical" role="alert">
              {saveError}
            </div>
          ) : null}
        </div>

        <OrgRoleCalibrationSection
          roleId={role.roleId}
          workspaceId={workspaceId}
        />
      </OrgSection>

      {canManage && hasChanges ? (
        <OrgUnsavedChangesBar
          canSave={hasChanges}
          hasChanges={hasChanges}
          onCancel={cancelEditing}
          onSave={() => void save()}
          pending={updateRole.isPending}
        />
      ) : null}
    </div>
  );
}
