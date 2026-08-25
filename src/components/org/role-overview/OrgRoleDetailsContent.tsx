import { useState } from "react";
import { OrgSection } from "@/components/org/workspace/OrgSection";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { DocumentEditor } from "@/components/ui/document-editor";
import { Text } from "@/components/ui/text";
import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useUnsavedChangesWarning } from "@/hooks/org/useUnsavedChangesWarning";
import { createOrgEditingDismissHandlers } from "@/lib/org/editingInteraction";
import { humanizeOrgEmploymentType } from "@/lib/org/pipelineStage";
import type { OrgRole } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";
import {
  getRoleOverviewErrorMessage,
  RoleSectionHeading,
} from "./RoleOverviewShared";
import { cn } from "@/lib/utils";

type RoleDetailsDraft = {
  description: string;
};

type RoleDetailsEditingField = keyof RoleDetailsDraft;

const EMPTY_ROLE_DETAIL = "저장된 정보가 없습니다.";

function toRoleDetailsDraft(role: OrgRole): RoleDetailsDraft {
  return {
    description: role.description ?? "",
  };
}

export function OrgRoleDetailsContent({
  role,
  workspaceId,
}: {
  role: OrgRole;
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
  const currentDraft = draft ?? toRoleDetailsDraft(role);
  const roleDetails = [
    { label: "역할명", value: role.name.trim() },
    { label: "보상 정보", value: role.salaryRange?.trim() ?? "" },
    { label: "근무 지역", value: role.locationText?.trim() ?? "" },
    {
      label: "근무 형태",
      value: role.employmentTypes
        .filter((employmentType) => employmentType.trim())
        .map(humanizeOrgEmploymentType)
        .join(", "),
    },
  ];
  const hasChanges =
    draft !== null &&
    draft.description !== toRoleDetailsDraft(role).description;

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

  const cancelEditing = () => {
    if (updateRole.isPending) return;
    setDraft(null);
    setEditingField(null);
    setSaveError("");
  };

  const save = async () => {
    if (!draft || !hasChanges || updateRole.isPending) return;

    setSaveError("");
    try {
      await updateRole.mutateAsync({
        description: draft.description.trim() || null,
        roleId: role.roleId,
        workspaceId,
      });
      setDraft(null);
      setEditingField(null);
      addToast({ message: "정보를 저장했습니다.", variant: "success" });
    } catch (error) {
      const message = getRoleOverviewErrorMessage(
        error,
        "정보를 저장하지 못했습니다."
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
          <RoleSectionHeading size="large" title="Description" />
        </div>
        <dl className="mb-8 grid grid-cols-2 gap-x-4 gap-y-4">
          {roleDetails.map(({ label, value }) => (
            <div className="min-w-0" key={label}>
              <dt>
                <Text as="span" className="font-normal text-[13px] text-black">
                  {label}
                </Text>
              </dt>
              <dd className="break-words">
                <Text
                  as="span"
                  className={cn(
                    value ? undefined : "text-black/30",
                    "text-[13px]"
                  )}
                >
                  {value || EMPTY_ROLE_DETAIL}
                </Text>
              </dd>
            </div>
          ))}
        </dl>
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
          placeholder="후보자에게 보여줄 역할 설명을 문서처럼 작성해 주세요."
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
    </div>
  );
}
