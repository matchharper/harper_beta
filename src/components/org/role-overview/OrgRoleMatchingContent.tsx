import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
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
  useRoleOverviewErrorMessage,
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
  const { c } = useOrgLocale();
  const getRoleOverviewErrorMessage = useRoleOverviewErrorMessage();
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
        message: c("정보를 저장했습니다.", "Information saved."),
        variant: "success",
      });
    } catch (error) {
      const message = getRoleOverviewErrorMessage(
        error,
        c("정보를 저장하지 못했습니다.", "Failed to save information.")
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
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <RoleSectionHeading
                size="large"
                title={c("Hiring Brief", "Hiring Brief")}
              />
              <div className="mt-1 text-[14px] font-normal leading-5 text-black/60">
                {c(
                  "인재를 평가할 때 내부적으로 사용하는 기준입니다.",
                  "Internal summary used to evaluate talents."
                )}
              </div>
            </div>
          </div>
          <DocumentEditor
            {...documentEditorCopy}
            aria-label={c("Hiring Brief 수정", "Edit hiring brief")}
            disabled={updateRole.isPending}
            documentTitle="Hiring Brief"
            showTitle={false}
            errorMessage={editingField === "request" ? saveError : ""}
            lastChangedAt={role.updatedAt}
            onChange={(event) =>
              changeDraft({ request: event.target.value }, "request")
            }
            placeholder={c(
              "Harper가 후보자를 탐색하고 판단할 때 알아야 할 내부 기준을 알려주세요.",
              "Provide Harper with internal criteria for sourcing and evaluating candidates."
            )}
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
              info={c(
                "이름은 기준을 나타내고, 상세 내용에는 필요한 수준과 근거, 가산점 또는 우려 요소를 적어요. 2–4개를 권장하며 최대 6개까지 추가할 수 있어요.",
                "Give each criterion a clear name. Add the required level, rationale, strengths, and concerns in the details. Use 2–4 criteria, up to 6."
              )}
              size="large"
              title={c("Evaluation Criteria", "Evaluation Criteria")}
            />
            {editingField !== "criteria" ? (
              <MuteButton
                disabled={!canManage || updateRole.isPending}
                onClick={startCriteriaEditing}
                variant="transparent"
              >
                {currentDraft.criteria.length
                  ? c("수정하기", "Edit")
                  : c("작성하기", "Create")}
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
                      {c("기준", "Criteria")}
                      {index + 1}
                    </label>
                    <MuteButton
                      aria-label={c("기준 {p0} 삭제", "Delete criterion {p0}", {
                        p0: index + 1,
                      })}
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
                    aria-label={c("기준 {p0} 이름", "Criterion {p0} name", {
                      p0: index + 1,
                    })}
                    id={`role-criterion-name-${index}`}
                    onChange={(event) =>
                      changeCriterion(index, { name: event.target.value })
                    }
                    placeholder={c(
                      "예: Experience level",
                      "e.g. Experience level"
                    )}
                    value={item.name}
                  />
                  <Textarea
                    autoResize
                    aria-label={c(
                      "기준 {p0} 상세 내용",
                      "Criterion {p0} details",
                      { p0: index + 1 }
                    )}
                    className="mt-2 min-h-[96px]"
                    onChange={(event) =>
                      changeCriterion(index, {
                        criteria: event.target.value,
                      })
                    }
                    placeholder={c(
                      "필요한 수준, 판단 근거, 가산점과 우려 요소를 구체적으로 적어주세요.",
                      "Specify required level, evaluation rationale, plus points, and concerns."
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
                  {c("기준 추가하기", "Add criterion")}
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
              Empty
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
