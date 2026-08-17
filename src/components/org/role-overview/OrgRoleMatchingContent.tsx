import { Plus, X } from "lucide-react";
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
      addToast({ message: "Role 정보를 저장했습니다.", variant: "success" });
    } catch (error) {
      const message = getRoleOverviewErrorMessage(
        error,
        "Role 정보를 저장하지 못했습니다."
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
              <RoleSectionHeading size="large" title="Role Request" />
              <div className="mt-1 text-[13px] font-normal leading-5 text-black/60">
                이 내용은 매번 인재를 탐색하고 연결하거나 후보자를 추천할 때
                기준으로 반영됩니다. 여러가지 사항이 있다면 무엇이 더 우선순위가
                높은지 등을 자세히 알려주실 수록 좋습니다.
                <br />
                내부적인 모든 판단 기준을 알려주세요. 민감한 사항도 전부
                괜찮습니다.
              </div>
            </div>
          </div>
          <DocumentEditor
            aria-label="Role Request 수정"
            disabled={updateRole.isPending}
            documentTitle="Request"
            errorMessage={editingField === "request" ? saveError : ""}
            lastChangedAt={role.updatedAt}
            onChange={(event) =>
              changeDraft({ request: event.target.value }, "request")
            }
            placeholder="Harper가 인재를 탐색하고 판단할 때 꼭 알아야 할 기준을 작성해 주세요."
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
              info="이름은 기준을 나타내고, 상세 내용에는 필요한 수준과 근거, 가산점 또는 우려 요소를 적습니다. 평가 기준은 0-6개까지 저장할 수 있으며, 후보자를 검토하기에 충분한 내용이 있다면 3-6개의 평가 축으로 정리하는 것을 권장합니다."
              size="large"
              title="평가 기준"
            />
            {editingField !== "criteria" ? (
              <MuteButton
                disabled={!canManage || updateRole.isPending}
                onClick={startCriteriaEditing}
                variant="transparent"
              >
                {currentDraft.criteria.length ? "수정하기" : "작성하기"}
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
                      기준 {index + 1}
                    </label>
                    <MuteButton
                      aria-label={`기준 ${index + 1} 삭제`}
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
                      <X className="size-3.5" />
                    </MuteButton>
                  </div>
                  <Input
                    aria-label={`기준 ${index + 1} 이름`}
                    id={`role-criterion-name-${index}`}
                    onChange={(event) =>
                      changeCriterion(index, { name: event.target.value })
                    }
                    placeholder="예: Experience level"
                    value={item.name}
                  />
                  <Textarea
                    aria-label={`기준 ${index + 1} 상세 내용`}
                    className="mt-2 min-h-[96px]"
                    onChange={(event) =>
                      changeCriterion(index, {
                        criteria: event.target.value,
                      })
                    }
                    placeholder="필요한 수준, 판단 근거, 가산점과 우려 요소를 구체적으로 적어주세요."
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
                  기준 추가하기
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
                  <div className="text-[13px] font-medium text-neutral-primary">
                    {index + 1}. {item.name}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-neutral-muted">
                    {item.criteria}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-md bg-bg-basement px-4 py-3 text-[13px] leading-5 text-neutral-muted">
              아직 구조화된 평가 기준이 없습니다. Harper가 역할 내용과 요청을
              바탕으로 먼저 초안을 작성합니다.
            </div>
          )}
          {editingField === "criteria" && saveError ? (
            <div className="mt-3 text-[12px] text-critical" role="alert">
              {saveError}
            </div>
          ) : null}
        </div>
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
