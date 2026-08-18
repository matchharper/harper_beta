import { useState } from "react";
import { OrgSection } from "@/components/org/workspace/OrgSection";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { DocumentEditor } from "@/components/ui/document-editor";
import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useUnsavedChangesWarning } from "@/hooks/org/useUnsavedChangesWarning";
import { createOrgEditingDismissHandlers } from "@/lib/org/editingInteraction";
import type { OrgRole } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";
import {
  getRoleOverviewErrorMessage,
  RoleSectionHeading,
} from "./RoleOverviewShared";

type RoleDetailsDraft = {
  description: string;
};

type RoleDetailsEditingField = keyof RoleDetailsDraft;

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
          <RoleSectionHeading
            description="후보자에게 전달되는 역할 설명입니다."
            size="large"
            title="Description"
          />
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
    </div>
  );
}
