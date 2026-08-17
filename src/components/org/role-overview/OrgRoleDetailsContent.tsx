import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { opsTheme } from "@/components/ops/theme";
import { OrgSection } from "@/components/org/workspace/OrgSection";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentEditor } from "@/components/ui/document-editor";
import {
  InlineEditableInput,
  InlineEditableSelect,
  InlineEditableValue,
} from "@/components/ui/inline-editable";
import RichText from "@/components/ui/rich-text";
import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useUnsavedChangesWarning } from "@/hooks/org/useUnsavedChangesWarning";
import { createOrgEditingDismissHandlers } from "@/lib/org/editingInteraction";
import type { OrgRole } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";
import {
  getRoleOverviewErrorMessage,
  RoleSectionHeading,
  RoleToggleButton,
} from "./RoleOverviewShared";

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  contract: "계약",
  full_time: "풀타임",
  internship: "인턴",
  part_time: "파트타임",
};

const WORK_MODE_LABEL: Record<string, string> = {
  hybrid: "하이브리드",
  onsite: "대면근무",
  remote: "리모트",
};

type RoleDetailsDraft = {
  description: string;
  employmentTypes: string[];
  externalJdUrl: string;
  locationText: string;
  name: string;
  salaryRange: string;
  workMode: string;
};

type RoleDetailsEditingField = keyof RoleDetailsDraft;

function toRoleDetailsDraft(role: OrgRole): RoleDetailsDraft {
  return {
    description: role.description ?? "",
    employmentTypes: [...role.employmentTypes],
    externalJdUrl: role.externalJdUrl ?? "",
    locationText: role.locationText ?? "",
    name: role.name,
    salaryRange: role.salaryRange ?? "",
    workMode: role.workMode ?? "",
  };
}

function normalizeRoleDetailsDraft(draft: RoleDetailsDraft) {
  return {
    ...draft,
    employmentTypes: [...draft.employmentTypes].sort(),
  };
}

function RoleDescriptionPreviewContent({ markdown }: { markdown: string }) {
  const trimmedMarkdown = markdown.trim();

  return (
    <div className="min-h-[240px] text-[13px] leading-6 text-neutral-primary">
      {trimmedMarkdown ? (
        <RichText content={trimmedMarkdown} />
      ) : (
        <p className="text-neutral-muted">입력된 Description이 없습니다.</p>
      )}
    </div>
  );
}

export function OrgRoleDetailsContent({
  role,
  roleCreation = false,
  workspaceId,
}: {
  role: OrgRole;
  roleCreation?: boolean;
  workspaceId: string;
}) {
  const { permissions } = useOrgWorkspace();
  const canManage = permissions.canManageCandidates;
  const addToast = useToastStore((state) => state.add);
  const updateRole = useUpdateOrgRole();
  const [editingField, setEditingField] =
    useState<RoleDetailsEditingField | null>(null);
  const [draft, setDraft] = useState<RoleDetailsDraft | null>(null);
  const [saveError, setSaveError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const currentDraft = draft ?? toRoleDetailsDraft(role);
  const hasChanges =
    draft !== null &&
    JSON.stringify(normalizeRoleDetailsDraft(draft)) !==
      JSON.stringify(normalizeRoleDetailsDraft(toRoleDetailsDraft(role)));

  useUnsavedChangesWarning(hasChanges);

  const changeDraft = (
    patch: Partial<RoleDetailsDraft>,
    field: RoleDetailsEditingField
  ) => {
    if (!canManage || updateRole.isPending) return;
    setEditingField(field);
    setSaveError("");
    setDraft((current) => ({
      ...(current ?? toRoleDetailsDraft(role)),
      ...patch,
    }));
  };

  const startEditing = (field: RoleDetailsEditingField) => {
    if (!canManage || updateRole.isPending) return;
    setDraft((current) => current ?? toRoleDetailsDraft(role));
    setSaveError("");
    setEditingField(field);
  };

  const cancelEditing = () => {
    if (updateRole.isPending) return;
    setDraft(null);
    setEditingField(null);
    setSaveError("");
  };

  const save = async () => {
    if (!draft || !hasChanges || updateRole.isPending) return;
    const name = draft.name.trim();
    if (!name) {
      const message = "Role title을 입력해 주세요.";
      setSaveError(message);
      addToast({ message, variant: "error" });
      return;
    }

    setSaveError("");
    try {
      await updateRole.mutateAsync({
        description: draft.description.trim() || null,
        employmentTypes: draft.employmentTypes,
        externalJdUrl: draft.externalJdUrl.trim() || null,
        locationText: draft.locationText.trim() || null,
        name,
        roleId: role.roleId,
        salaryRange: draft.salaryRange.trim() || null,
        workMode: draft.workMode || null,
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
      <OrgSection>
        <div className="mb-5">
          <RoleSectionHeading size="large" title="기본 정보" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <span className={opsTheme.label}>Role title</span>
            <InlineEditableInput
              ariaLabel="Role title 수정"
              disabled={!canManage || updateRole.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              editing={editingField === "name"}
              inputClassName="h-10 px-3 py-2 text-[13px]"
              onChange={(event) =>
                changeDraft({ name: event.target.value }, "name")
              }
              onEdit={() => startEditing("name")}
              required
              value={currentDraft.name}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <span className="flex items-center gap-2">
              <span className={opsTheme.label}>Salary</span>
              <span className="text-[11px] font-normal text-neutral-soft">
                Optional
              </span>
            </span>
            <InlineEditableInput
              ariaLabel="Salary 수정"
              disabled={!canManage || updateRole.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              editing={editingField === "salaryRange"}
              inputClassName="h-10 px-3 py-2 text-[13px]"
              onChange={(event) =>
                changeDraft({ salaryRange: event.target.value }, "salaryRange")
              }
              onEdit={() => startEditing("salaryRange")}
              placeholder="예: 연봉 7,000만–9,000만원 + 스톡옵션"
              value={currentDraft.salaryRange}
            />
          </div>
          <div className="grid gap-2">
            <div className={opsTheme.label}>고용 형태</div>
            <InlineEditableValue
              alwaysShowEditor
              ariaLabel="고용 형태 수정"
              disabled={!canManage || updateRole.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              displayValue={
                currentDraft.employmentTypes.length
                  ? currentDraft.employmentTypes
                      .map((type) => EMPLOYMENT_TYPE_LABEL[type] ?? type)
                      .join(", ")
                  : "-"
              }
              editing={editingField === "employmentTypes"}
              editor={
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(EMPLOYMENT_TYPE_LABEL).map(
                    ([type, label]) => (
                      <RoleToggleButton
                        active={currentDraft.employmentTypes.includes(type)}
                        disabled={!canManage || updateRole.isPending}
                        key={type}
                        onClick={() =>
                          changeDraft(
                            {
                              employmentTypes:
                                currentDraft.employmentTypes.includes(type)
                                  ? currentDraft.employmentTypes.filter(
                                      (item) => item !== type
                                    )
                                  : [...currentDraft.employmentTypes, type],
                            },
                            "employmentTypes"
                          )
                        }
                      >
                        {label}
                      </RoleToggleButton>
                    )
                  )}
                </div>
              }
              onEdit={() => startEditing("employmentTypes")}
            />
          </div>
          <div className="grid gap-2">
            <div className={opsTheme.label}>근무 방식</div>
            {roleCreation ? (
              <InlineEditableValue
                alwaysShowEditor
                ariaLabel="근무 방식 수정"
                disabled={!canManage || updateRole.isPending}
                displayClassName="text-[13px] leading-5 text-neutral-primary"
                displayValue={WORK_MODE_LABEL[currentDraft.workMode] ?? "-"}
                editing={editingField === "workMode"}
                editor={
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(WORK_MODE_LABEL).map(
                      ([workMode, label]) => (
                        <RoleToggleButton
                          active={currentDraft.workMode === workMode}
                          disabled={!canManage || updateRole.isPending}
                          key={workMode}
                          onClick={() => changeDraft({ workMode }, "workMode")}
                        >
                          {label}
                        </RoleToggleButton>
                      )
                    )}
                  </div>
                }
                onEdit={() => startEditing("workMode")}
              />
            ) : (
              <InlineEditableSelect
                ariaLabel="근무 방식 수정"
                disabled={!canManage || updateRole.isPending}
                displayClassName="text-[13px] leading-5 text-neutral-primary"
                editing={editingField === "workMode"}
                onEdit={() => startEditing("workMode")}
                onValueChange={(workMode) =>
                  changeDraft({ workMode }, "workMode")
                }
                options={Object.entries(WORK_MODE_LABEL).map(
                  ([value, label]) => ({ label, value })
                )}
                placeholder="근무 방식"
                triggerClassName="w-full text-[13px]"
                value={currentDraft.workMode}
              />
            )}
          </div>
          <div className="grid gap-2">
            <span className={opsTheme.label}>외부 JD 링크</span>
            <InlineEditableInput
              ariaLabel="외부 JD 링크 수정"
              disabled={!canManage || updateRole.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              editing={editingField === "externalJdUrl"}
              inputClassName="h-10 px-3 py-2 text-[13px]"
              onChange={(event) =>
                changeDraft(
                  { externalJdUrl: event.target.value },
                  "externalJdUrl"
                )
              }
              onEdit={() => startEditing("externalJdUrl")}
              placeholder="Optional"
              type="url"
              value={currentDraft.externalJdUrl}
            />
          </div>
          <div className="grid gap-2">
            <span className={opsTheme.label}>근무 지역</span>
            <InlineEditableInput
              ariaLabel="근무 지역 수정"
              disabled={!canManage || updateRole.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              editing={editingField === "locationText"}
              inputClassName="h-10 px-3 py-2 text-[13px]"
              onChange={(event) =>
                changeDraft(
                  { locationText: event.target.value },
                  "locationText"
                )
              }
              onEdit={() => startEditing("locationText")}
              value={currentDraft.locationText}
            />
          </div>
        </div>
        {editingField && editingField !== "description" && saveError ? (
          <div className="mt-3 text-[12px] text-critical" role="alert">
            {saveError}
          </div>
        ) : null}

        <div className="mt-6 mb-5 flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
          <RoleSectionHeading
            description="외부에 보여지는 역할 설명입니다."
            size="large"
            title="Description"
          />
          <div className="shrink-0">
            {/* <MuteButton
              aria-haspopup="dialog"
              onClick={() => setPreviewOpen(true)}
              variant="transparent"
            >
              Preview
              <ExternalLink className="size-3.5" />
            </MuteButton> */}
          </div>
        </div>
        <DocumentEditor
          aria-label="Description 수정"
          disabled={updateRole.isPending}
          documentTitle="Description"
          errorMessage={editingField === "description" ? saveError : ""}
          format="markdown"
          lastChangedAt={role.updatedAt}
          onValueChange={(description) =>
            changeDraft({ description }, "description")
          }
          placeholder="인재에게 보여줄 역할 설명을 문서처럼 작성해 주세요."
          readOnly={!canManage}
          rows={7}
          savedValue={role.description ?? ""}
          value={currentDraft.description}
        />
        {editingField === "description" && saveError ? (
          <div className="mt-3 text-[12px] text-critical" role="alert">
            {saveError}
          </div>
        ) : null}
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

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-neutral-1000-a05 px-6 py-5 pr-14">
            <DialogTitle className="text-[17px]">
              Description Preview
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              외부에 보여지는 역할 설명입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-6 py-6">
            <RoleDescriptionPreviewContent
              markdown={currentDraft.description}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
