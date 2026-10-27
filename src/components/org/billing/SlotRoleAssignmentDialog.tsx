import { BriefcaseBusiness, Layers } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { OrgActionPicker } from "../OrgActionPicker";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { BillingAssignmentRole } from "@/lib/org/billing/assignments";

export function SlotRoleAssignmentDialog({
  open,
  roles,
  slotCount,
  pendingRoleId,
  refreshing,
  error,
  onAssign,
  onRefresh,
  onClose,
}: {
  open: boolean;
  roles: BillingAssignmentRole[];
  slotCount: number;
  pendingRoleId: string | null;
  refreshing: boolean;
  error: string;
  onAssign: (roleId: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const { c } = useOrgLocale();
  const busy = Boolean(pendingRoleId);
  return (
    <TalentCareerModal
      open={open}
      onClose={() => !busy && onClose()}
      mobileBottomSheet
      closeOnBackdrop={!busy}
      showCloseButton={!busy}
      title={
        <div className="flex flex-row items-center gap-2">
          <Layers className="size-4" />
          {c(
            "어떤 역할에 슬롯을 배정할까요?",
            "Which role should use your new slot?"
          )}
        </div>
      }
      description={c(
        "새 슬롯 {count}개를 사용할 수 있어요.",
        "New slots available: {count}.",
        { count: slotCount }
      )}
      panelClassName="max-w-md"
      bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
    >
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
      <OrgActionPicker
        items={roles.map((role) => ({
          id: role.roleId,
          name: role.name,
          icon: (
            <BriefcaseBusiness
              className="size-3.5 shrink-0 text-neutral-muted"
              aria-hidden="true"
            />
          ),
          actionLabel: c("{role}에 슬롯 배정", "Assign a slot to {role}", {
            role: role.name,
          }),
        }))}
        searchLabel={c("역할 검색", "Search roles")}
        listLabel={c("슬롯을 배정할 역할", "Role to assign a slot to")}
        refreshLabel={c("역할 목록 새로고침", "Refresh role list")}
        emptyMessage={c(
          "슬롯을 배정할 활성 역할이 없어요.",
          "No active roles need a slot."
        )}
        noMatchMessage={c("일치하는 역할이 없어요.", "No matching roles.")}
        pendingId={pendingRoleId}
        refreshing={refreshing}
        onSelect={onAssign}
        onRefresh={onRefresh}
      >
        <div className="flex shrink-0 pt-1">
          <MuteButton size="sm" disabled={busy} onClick={onClose}>
            {c("나중에", "Not now")}
          </MuteButton>
        </div>
      </OrgActionPicker>
    </TalentCareerModal>
  );
}
