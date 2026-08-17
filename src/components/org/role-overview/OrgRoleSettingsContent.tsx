import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowRight,
  CircleStop,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  SlackIcon,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import RichText from "@/components/ui/rich-text";
import { Switch } from "@/components/ui/switch";
import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import {
  useOrgRoleNotificationSettings,
  useUpdateOrgRoleNotificationSettings,
} from "@/hooks/org/useOrgRoleNotifications";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useUnsavedChangesWarning } from "@/hooks/org/useUnsavedChangesWarning";
import { createOrgEditingDismissHandlers } from "@/lib/org/editingInteraction";
import { buildOrgHref } from "@/lib/org/routes";
import {
  getOrgRoleLifecycleUpdate,
  normalizeOrgRoleStatus,
  type OrgRoleStatus,
} from "@/lib/org/roleStatus";
import type { OrgRole } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/useToastStore";
import {
  getRoleOverviewErrorMessage,
  RoleSectionHeading,
} from "./RoleOverviewShared";

function formatChannelName(name: string | null, channelId: string) {
  const value = name?.trim() || channelId;
  return value.startsWith("#") ? value : `#${value}`;
}

export function OrgRoleSettingsContent({
  layout = "overview",
  role,
  roleCreation = false,
  workspaceId,
}: {
  layout?: "overview" | "panel";
  role: OrgRole;
  roleCreation?: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  const {
    bootstrap: { members },
    permissions,
  } = useOrgWorkspace();
  const canManage = permissions.canManageCandidates;
  const addToast = useToastStore((state) => state.add);
  const updateRoleStatus = useUpdateOrgRole();
  const updateNotifications = useUpdateOrgRoleNotificationSettings();
  const settingsQuery = useOrgRoleNotificationSettings({
    roleId: role.roleId,
    workspaceId,
  });
  const [settingsEditing, setSettingsEditing] = useState(false);
  const [channelOverrides, setChannelOverrides] = useState<
    Record<string, boolean>
  >({});
  const [assigneeOverride, setAssigneeOverride] = useState<string[] | null>(
    null
  );
  const [statusToConfirm, setStatusToConfirm] = useState<OrgRoleStatus | null>(
    null
  );
  const [roleDeleteConfirmOpen, setRoleDeleteConfirmOpen] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState("");
  const channels = useMemo(
    () =>
      settingsQuery.data?.channels.map((channel) => ({
        ...channel,
        enabled: channelOverrides[channel.channelId] ?? channel.enabled,
      })) ?? null,
    [channelOverrides, settingsQuery.data]
  );
  const notificationChanged = Object.keys(channelOverrides).length > 0;
  const assigneeUserIds =
    assigneeOverride ?? settingsQuery.data?.assigneeUserIds ?? [];
  const assigneeChanged =
    assigneeOverride !== null &&
    JSON.stringify([...assigneeOverride].sort()) !==
      JSON.stringify([...(settingsQuery.data?.assigneeUserIds ?? [])].sort());
  const hasChanges = notificationChanged || assigneeChanged;
  const settingsPending = updateNotifications.isPending;

  useUnsavedChangesWarning(hasChanges);

  const assignedMembers = assigneeUserIds.flatMap((userId) => {
    const member = members.find((item) => item.userId === userId);
    return member ? [member] : [];
  });
  const assignableMembers = members.filter(
    (member) => member.email && !assigneeUserIds.includes(member.userId)
  );
  const initialStatus = normalizeOrgRoleStatus(role.status);
  const lifecycleStatus =
    initialStatus === "top_priority" ? "active" : initialStatus;
  const statusMeta = roleCreation
    ? {
        description: "아직 채용을 시작하지 않았습니다.",
        label: "작성 중",
      }
    : lifecycleStatus === "active"
      ? {
          description: "현재 후보자를 추천받고 채용을 진행하고 있습니다.",
          label: "채용 진행 중",
        }
      : lifecycleStatus === "paused"
        ? {
            description: "후보자 추천을 잠시 멈춘 상태입니다.",
            label: "채용 일시정지",
          }
        : {
            description: "채용이 종료되어 후보자를 추천받지 않습니다.",
            label: "채용 종료",
          };
  const statusConfirmCopy =
    statusToConfirm === "active"
      ? {
          description: "후보자 추천을 다시 시작하고 채용을 진행합니다.",
          title: "채용을 다시 진행할까요?",
        }
      : statusToConfirm === "paused"
        ? {
            description:
              "후보자 추천을 일시정지합니다. 언제든 다시 진행할 수 있습니다.",
            title: "채용을 일시정지할까요?",
          }
        : {
            description:
              "후보자 추천을 종료합니다. 필요하면 이후 다시 채용 진행 상태로 바꿀 수 있습니다.",
            title: "채용을 종료할까요?",
          };

  const changeAssignees = (nextUserIds: string[]) => {
    if (!canManage || settingsPending) return;
    const uniqueUserIds = Array.from(new Set(nextUserIds));
    setAssigneeOverride(roleCreation ? uniqueUserIds.slice(-1) : uniqueUserIds);
    setSettingsEditing(true);
    setSettingsSaveError("");
  };

  const cancelEditing = () => {
    if (settingsPending) return;
    setChannelOverrides({});
    setAssigneeOverride(null);
    setSettingsSaveError("");
    setSettingsEditing(false);
  };

  const save = async () => {
    if (!channels || !hasChanges || settingsPending) return;
    setSettingsSaveError("");

    try {
      await updateNotifications.mutateAsync({
        assigneeUserIds,
        channels: channels.map(({ channelId, enabled }) => ({
          channelId,
          enabled,
        })),
        roleId: role.roleId,
        workspaceId,
      });
      setChannelOverrides({});
      setAssigneeOverride(null);
      setSettingsEditing(false);
      addToast({ message: "Role 설정을 저장했습니다.", variant: "success" });
    } catch (error) {
      setSettingsSaveError(
        getRoleOverviewErrorMessage(error, "Role 설정을 저장하지 못했습니다.")
      );
    }
  };

  const confirmStatusChange = async () => {
    if (!statusToConfirm || updateRoleStatus.isPending) return;
    try {
      await updateRoleStatus.mutateAsync({
        roleId: role.roleId,
        status: statusToConfirm,
        workspaceId,
      });
      addToast({ message: "채용 상태를 변경했습니다.", variant: "success" });
      setStatusToConfirm(null);
    } catch (error) {
      addToast({
        message: getRoleOverviewErrorMessage(
          error,
          "채용 상태를 변경하지 못했습니다."
        ),
        variant: "error",
      });
    }
  };

  const confirmRoleDeletion = async () => {
    if (updateRoleStatus.isPending) return;
    try {
      await updateRoleStatus.mutateAsync({
        ...getOrgRoleLifecycleUpdate("delete"),
        roleId: role.roleId,
        workspaceId,
      });
    } catch (error) {
      addToast({
        message: getRoleOverviewErrorMessage(
          error,
          "역할을 삭제하지 못했습니다."
        ),
        variant: "error",
      });
      return;
    }

    setRoleDeleteConfirmOpen(false);
    addToast({ message: "역할을 삭제했습니다.", variant: "success" });
    void router.push(
      buildOrgHref({ orgId: workspaceId, page: "jobs", roleId: "all" })
    );
  };

  const editingDismissHandlers = createOrgEditingDismissHandlers({
    active: settingsEditing,
    hasChanges,
    onDismiss: cancelEditing,
    pending: settingsPending,
  });

  return (
    <div {...editingDismissHandlers} className="space-y-8">
      <OrgSection
        className={layout === "overview" ? "last:border-b" : undefined}
      >
        <div
          className={cn(
            "grid gap-8",
            layout === "overview" &&
              "lg:grid-cols-[minmax(260px,0.72fr)_minmax(360px,1.28fr)] lg:gap-12"
          )}
        >
          <section className="min-w-0 space-y-2">
            <RoleSectionHeading title="Status" />
            <div className="rounded-md bg-bg-basement px-3 py-3 text-sm">
              {statusMeta.label}
              <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
                {statusMeta.description}
              </p>
            </div>
            {!roleCreation ? (
              <div className="flex flex-wrap gap-2">
                {lifecycleStatus === "active" ? (
                  <MuteButton
                    disabled={!canManage || updateRoleStatus.isPending}
                    onClick={() => setStatusToConfirm("paused")}
                  >
                    <Pause className="size-4" />
                    채용 일시정지
                  </MuteButton>
                ) : (
                  <MuteButton
                    disabled={!canManage || updateRoleStatus.isPending}
                    onClick={() => setStatusToConfirm("active")}
                    variant="default"
                  >
                    <Play className="size-4" />
                    채용 진행하기
                  </MuteButton>
                )}
                {lifecycleStatus !== "ended" ? (
                  <MuteButton
                    disabled={!canManage || updateRoleStatus.isPending}
                    onClick={() => setStatusToConfirm("ended")}
                    variant="warn"
                  >
                    <CircleStop className="size-4" />
                    채용 종료하기
                  </MuteButton>
                ) : null}
              </div>
            ) : null}
          </section>

          {settingsQuery.error ? (
            <section className="space-y-3">
              <div className="rounded-md border border-critical/20 bg-critical-faded px-3 py-3 text-[13px] text-critical">
                {getRoleOverviewErrorMessage(
                  settingsQuery.error,
                  "Role 설정을 불러오지 못했습니다."
                )}
              </div>
              <MuteButton onClick={() => void settingsQuery.refetch()}>
                다시 시도
              </MuteButton>
            </section>
          ) : settingsQuery.isLoading || !channels ? (
            <div className="flex h-48 items-center justify-center text-neutral-muted">
              <LoaderCircle className="size-5 animate-spin" />
            </div>
          ) : (
            <section className="min-w-0 space-y-7">
              <div className="space-y-2">
                <RoleSectionHeading
                  description="이 포지션의 새로운 연결 소식을 받을 Slack 채널을 선택하세요."
                  title="알림 채널"
                />
                {channels.length > 0 ? (
                  <div className="divide-y divide-neutral-1000-a05 bg-bg-default">
                    {channels.map((channel) => (
                      <div
                        className="flex items-center gap-3 py-1"
                        key={channel.channelId}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-1000-a05 text-neutral-muted">
                          <SlackIcon
                            className="size-4"
                            color="currentColor"
                            fill="currentColor"
                          />
                        </span>
                        <div className="min-w-0 flex-1 truncate text-[14px] font-normal text-neutral-primary">
                          {formatChannelName(
                            channel.channelName,
                            channel.channelId
                          )}
                        </div>
                        <Switch
                          aria-label={`${formatChannelName(channel.channelName, channel.channelId)} 알림`}
                          checked={channel.enabled}
                          className="data-[state=checked]:bg-positive"
                          disabled={!canManage || settingsPending}
                          onCheckedChange={(enabled) => {
                            if (!canManage || settingsPending) return;
                            setSettingsEditing(true);
                            setSettingsSaveError("");
                            const initial = settingsQuery.data?.channels.find(
                              (item) => item.channelId === channel.channelId
                            )?.enabled;
                            setChannelOverrides((current) => {
                              const next = { ...current };
                              if (enabled === initial) {
                                delete next[channel.channelId];
                              } else {
                                next[channel.channelId] = enabled;
                              }
                              return next;
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex w-full flex-col items-start justify-between gap-3 border-t border-neutral-1000-a05 py-4 text-[13px] leading-5 text-neutral-muted sm:flex-row sm:items-center">
                    <div className="max-w-lg">
                      연결된 Slack 채널이 없습니다. Settings에서 먼저 채널을
                      연결해 주세요.
                    </div>
                    <MuteButton asChild variant="transparent">
                      <Link
                        href={buildOrgHref({
                          orgId: workspaceId,
                          page: "settings",
                        })}
                      >
                        이동 <ArrowRight className="size-4" />
                      </Link>
                    </MuteButton>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <RoleSectionHeading
                  description={
                    roleCreation
                      ? "이 역할의 알림과 후보자 진행을 맡을 담당자를 선택하세요."
                      : "이 역할의 후보자 연결을 함께 담당할 멤버를 선택하세요."
                  }
                  info="담당자로 설정한 멤버는 이 역할의 후보자와 연결될 때 소개 이메일 CC에 자동으로 포함됩니다."
                  title="담당자"
                />
                <div className="flex items-start gap-3 pt-1">
                  <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                    {assignedMembers.map((member) => (
                      <div
                        className="flex min-w-0 max-w-full items-center gap-2 rounded-full bg-black/5 py-1 pr-1 pl-3.5"
                        key={member.userId}
                      >
                        <span className="max-w-36 truncate text-[13px] font-medium text-neutral-primary">
                          {member.name || "이름 없음"}
                        </span>
                        <span className="max-w-52 truncate text-[12px] text-neutral-muted">
                          {member.email || "이메일 없음"}
                        </span>
                        {member.role ? (
                          <span className="max-w-32 truncate text-[12px] text-neutral-soft">
                            {member.role}
                          </span>
                        ) : null}
                        <MuteButton
                          aria-label={`${member.name || member.email || "담당자"} 제외`}
                          className="ml-0.5 rounded-full"
                          disabled={!canManage || settingsPending}
                          onClick={() =>
                            changeAssignees(
                              assigneeUserIds.filter(
                                (userId) => userId !== member.userId
                              )
                            )
                          }
                          size="sm"
                          variant="transparent"
                        >
                          <X className="size-3.5" />
                        </MuteButton>
                      </div>
                    ))}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <MuteButton
                          className="shrink-0"
                          disabled={!canManage || settingsPending}
                        >
                          <Plus className="size-4" />
                          {roleCreation && assignedMembers.length > 0
                            ? "담당자 변경"
                            : "담당자 추가"}
                        </MuteButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-[240px] max-w-[calc(100vw-2rem)]"
                      >
                        {assignableMembers.length > 0 ? (
                          assignableMembers.map((member) => (
                            <DropdownMenuItem
                              className="items-start"
                              key={member.userId}
                              onSelect={() =>
                                changeAssignees([
                                  ...assigneeUserIds,
                                  member.userId,
                                ])
                              }
                            >
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-medium text-neutral-primary">
                                  {member.name || member.email || "이름 없음"}
                                </div>
                                <div className="mt-0.5 truncate text-[11px] text-neutral-muted">
                                  {[member.email, member.role]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              </div>
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <DropdownMenuItem disabled>
                            추가할 수 있는 멤버가 없습니다.
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
              {settingsSaveError ? (
                <div
                  className="rounded-md border border-critical/20 bg-critical-faded px-3 py-3 text-[12px] text-critical"
                  role="alert"
                >
                  {settingsSaveError}
                </div>
              ) : null}
            </section>
          )}
        </div>
      </OrgSection>

      {/* {layout === "panel" ? (
        <OrgSection>
          <OrgSectionHeader
            description="후보자 매칭 기준과는 별도로, Harper가 이 역할에 대해 계속 기억해야 할 운영 맥락입니다."
            title="Guide for Harper"
          />
          {role.memory?.trim() ? (
            <div className="min-h-28 text-[13px] leading-6 text-neutral-primary">
              <RichText content={role.memory} />
            </div>
          ) : (
            <div className="min-h-28 py-2 text-[13px] leading-6 text-neutral-muted">
              아직 저장된 내용이 없습니다. Harper가 기억해야 할 역할별 맥락을
              알려주세요.
            </div>
          )}
        </OrgSection>
      ) : null} */}

      {roleCreation && layout === "panel" ? (
        <OrgSection>
          <OrgSectionHeader title="역할 삭제" />
          <MuteButton
            disabled={!canManage || hasChanges || updateRoleStatus.isPending}
            onClick={() => setRoleDeleteConfirmOpen(true)}
            title={
              hasChanges
                ? "변경사항을 저장하거나 취소한 후 삭제할 수 있습니다."
                : undefined
            }
            variant="warn"
          >
            <Trash2 className="size-3" />
            역할 삭제하기
          </MuteButton>
          {hasChanges ? (
            <p className="mt-2 text-[12px] leading-5 text-neutral-muted">
              변경사항을 저장하거나 취소한 후 삭제할 수 있습니다.
            </p>
          ) : null}
        </OrgSection>
      ) : null}

      {canManage && hasChanges ? (
        <OrgUnsavedChangesBar
          canSave={hasChanges}
          hasChanges={hasChanges}
          onCancel={cancelEditing}
          onSave={() => void save()}
          pending={settingsPending}
        />
      ) : null}

      <Dialog
        open={Boolean(statusToConfirm)}
        onOpenChange={(open) => {
          if (!open && !updateRoleStatus.isPending) setStatusToConfirm(null);
        }}
      >
        <DialogContent className="max-w-sm gap-5 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px]">
              {statusConfirmCopy.title}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              {statusConfirmCopy.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <MuteButton
              disabled={updateRoleStatus.isPending}
              onClick={() => setStatusToConfirm(null)}
              size="lg"
            >
              취소
            </MuteButton>
            <MuteButton
              disabled={updateRoleStatus.isPending}
              onClick={() => void confirmStatusChange()}
              size="lg"
              variant={statusToConfirm === "ended" ? "warn" : "primary"}
            >
              {updateRoleStatus.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : statusToConfirm === "active" ? (
                <Play className="size-4" />
              ) : statusToConfirm === "paused" ? (
                <Pause className="size-4" />
              ) : (
                <CircleStop className="size-4" />
              )}
              {statusToConfirm === "active"
                ? "채용 진행하기"
                : statusToConfirm === "paused"
                  ? "일시정지"
                  : "채용 종료하기"}
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !updateRoleStatus.isPending) {
            setRoleDeleteConfirmOpen(false);
          }
        }}
        open={roleDeleteConfirmOpen}
      >
        <DialogContent className="max-w-sm gap-5 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px]">역할 삭제</DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              “{role.name}” 역할을 삭제합니다. 계속할까요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <MuteButton
              disabled={updateRoleStatus.isPending}
              onClick={() => setRoleDeleteConfirmOpen(false)}
              size="lg"
            >
              취소
            </MuteButton>
            <MuteButton
              disabled={updateRoleStatus.isPending}
              onClick={() => void confirmRoleDeletion()}
              size="lg"
              variant="warn"
            >
              {updateRoleStatus.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              삭제
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
