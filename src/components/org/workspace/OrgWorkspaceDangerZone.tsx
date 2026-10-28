import { useId, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteOrgWorkspace } from "@/hooks/org/useOrg";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale, type OrgCopy } from "@/i18n/org/OrgLocaleProvider";
import { buildOrgHref } from "@/lib/org/routes";
import { workspaceDeletionErrorCode } from "@/lib/org/workspaceDeletion";
import { useOrgWorkspaceStore } from "@/store/useOrgWorkspaceStore";
import { OrgSection, OrgSectionHeader } from "./OrgSection";

function deletionErrorCopy(error: unknown, c: OrgCopy) {
  switch (workspaceDeletionErrorCode(error)) {
    case "workspace_delete_owner_required":
      return c(
        "Owner만 워크스페이스를 삭제할 수 있어요.",
        "Only an owner can delete this workspace."
      );
    case "workspace_delete_not_found":
      return c(
        "이미 삭제된 워크스페이스예요. 새로고침해 주세요.",
        "This workspace has already been deleted. Refresh the page."
      );
    case "workspace_delete_name_mismatch":
      return c(
        "현재 워크스페이스 이름과 일치하지 않아요. 새로고침 후 다시 확인해 주세요.",
        "The name does not match the current workspace name. Refresh and try again."
      );
    case "workspace_delete_subscription_active":
      return c(
        "유료 구독이 완전히 종료된 뒤 삭제할 수 있어요. 해지 예약 중이라면 이용 기간이 끝날 때까지 기다려 주세요.",
        "You can delete the workspace after all paid subscriptions have ended. If cancellation is scheduled, wait until the subscription period ends."
      );
    case "workspace_delete_billing_pending":
      return c(
        "진행 중인 결제나 구독 변경이 있어요. 완료되거나 만료된 뒤 다시 시도해 주세요.",
        "A checkout or subscription change is in progress. Try again after it completes or expires."
      );
    case "workspace_delete_billing_changed":
      return c(
        "결제 정보가 변경됐어요. 잠시 후 다시 시도해 주세요.",
        "Billing information changed. Please try again shortly."
      );
    case "workspace_delete_billing_unavailable":
      return c(
        "구독 종료 여부를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
        "We could not verify your subscription status. Please try again shortly."
      );
    default:
      return c(
        "워크스페이스를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.",
        "Could not delete the workspace. Please try again shortly."
      );
  }
}

export function OrgWorkspaceDangerZone() {
  const {
    bootstrap: { members },
    user,
    workspace,
  } = useOrgWorkspace();
  const { c } = useOrgLocale();
  const deletion = useDeleteOrgWorkspace();
  const formId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const pending = deletion.isPending || deletion.isSuccess;
  const canDelete =
    name.trim() !== "" && name.trim() === workspace.companyName.trim();
  if (
    !members.some(
      (member) => member.userId === user.id && member.authority === "owner"
    )
  )
    return null;

  const close = () => {
    if (pending) return;
    setOpen(false);
    setName("");
    deletion.reset();
  };
  const remove = async (event: FormEvent) => {
    event.preventDefault();
    if (!canDelete || pending) return;
    try {
      await deletion.mutateAsync({
        workspaceId: workspace.workspaceId,
        confirmationName: name.trim(),
      });
    } catch {
      return;
    }
    useOrgWorkspaceStore.getState().setLastWorkspaceId("");
    // A fresh bootstrap discards all workspace-scoped caches and selects another
    // membership, or shows the normal workspace entry when this was the last one.
    window.location.replace("/org");
  };
  const errorCode = workspaceDeletionErrorCode(deletion.error);

  return (
    <OrgSection className="mt-8">
      <OrgSectionHeader
        title={<span className="text-critical">Danger zone</span>}
      />
      <MuteButton variant="warn" onClick={() => setOpen(true)}>
        {c("워크스페이스 삭제", "Delete workspace")}
      </MuteButton>
      <TalentCareerModal
        open={open}
        onClose={close}
        mobileBottomSheet
        closeOnBackdrop={!pending}
        showCloseButton={!pending}
        panelClassName="max-w-[480px]"
        bodyClassName="px-4 sm:px-5"
        title={c("{name} 삭제", "Delete {name}", {
          name: workspace.companyName,
        })}
        description={c(
          "이 워크스페이스의 Role, 후보자 진행 이력, 대화와 팀원 접근 권한이 영구 삭제돼요. 되돌릴 수 없어요.",
          "This permanently deletes the workspace’s roles, candidate activity, conversations, and team access. This cannot be undone."
        )}
        footer={
          <div className="flex w-full justify-end gap-2">
            <MuteButton disabled={pending} onClick={close}>
              {c("취소", "Cancel")}
            </MuteButton>
            <MuteButton
              type="submit"
              form={formId}
              variant="warn"
              disabled={!canDelete || pending}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : null}
              {pending
                ? c("삭제 중…", "Deleting…")
                : c("영구 삭제", "Delete permanently")}
            </MuteButton>
          </div>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => void remove(event)}
          className="space-y-4"
        >
          <p className="text-sm text-neutral-muted">
            {c(
              "개인 계정과 다른 워크스페이스는 유지돼요.",
              "Your account and other workspaces are preserved."
            )}
          </p>
          <div className="space-y-2">
            <label htmlFor={inputId} className="block break-words text-sm">
              {c(
                "워크스페이스 이름을 입력하세요: {name}",
                "Type {name} to confirm.",
                {
                  name: workspace.companyName,
                }
              )}
            </label>
            <Input
              id={inputId}
              autoComplete="off"
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {deletion.error ? (
            <div role="alert" className="space-y-2 text-sm text-critical">
              <p>{deletionErrorCopy(deletion.error, c)}</p>
              {errorCode === "workspace_delete_subscription_active" ||
              errorCode === "workspace_delete_billing_pending" ? (
                <Link
                  href={buildOrgHref({
                    orgId: workspace.workspaceId,
                    page: "slots",
                  })}
                  className="underline underline-offset-4"
                >
                  {c("구독 관리", "Manage subscriptions")}
                </Link>
              ) : null}
            </div>
          ) : null}
        </form>
      </TalentCareerModal>
    </OrgSection>
  );
}
