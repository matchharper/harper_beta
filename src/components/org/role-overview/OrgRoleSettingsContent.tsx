import { useOrgT } from "@/i18n/org/OrgLocaleProvider";
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
import { AppleSwitch, Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DEFAULT_INTRO_SEARCH_DAYS,
  DEFAULT_INTRO_SEARCH_HOUR,
  INTRO_SEARCH_DAYS,
  type IntroSearchDay,
} from "@/lib/org/introSearchSchedule";
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

function formatHour(hour: number) {
  return `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`;
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
  const t = useOrgT();
  const router = useRouter();
  const {
    bootstrap: { members },
    internalOpsAccess,
    permissions,
  } = useOrgWorkspace();
  const canManage = permissions.canManageCandidates;
  const addToast = useToastStore((state) => state.add);
  const updateRoleStatus = useUpdateOrgRole();
  const updateCompanyFirstSearch = useUpdateOrgRole();
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
  const [companyFirstSearchError, setCompanyFirstSearchError] = useState("");
  const [scheduleDaysOverride, setScheduleDaysOverride] = useState<
    IntroSearchDay[] | null
  >(null);
  const [scheduleHourOverride, setScheduleHourOverride] = useState<
    number | null
  >(null);
  const savedScheduleDays = role.introSearchDate ?? DEFAULT_INTRO_SEARCH_DAYS;
  const savedScheduleHour = role.introSearchTime ?? DEFAULT_INTRO_SEARCH_HOUR;
  const scheduleDays = scheduleDaysOverride ?? savedScheduleDays;
  const scheduleHour = scheduleHourOverride ?? savedScheduleHour;
  const scheduleChanged =
    scheduleDays.join(",") !== savedScheduleDays.join(",") ||
    scheduleHour !== savedScheduleHour;
  const companyFirstSearchEnabled =
    updateCompanyFirstSearch.isPending &&
    typeof updateCompanyFirstSearch.variables?.isCompanyFirstSearch ===
      "boolean"
      ? updateCompanyFirstSearch.variables.isCompanyFirstSearch
      : role.isCompanyFirstSearch === true;
  const scheduleDisabled =
    !companyFirstSearchEnabled ||
    !canManage ||
    updateCompanyFirstSearch.isPending;
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

  useUnsavedChangesWarning(hasChanges || scheduleChanged);

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
  const showRoleDeletion =
    layout === "panel" && (roleCreation || lifecycleStatus === "ended");
  const statusMeta = roleCreation
    ? {
        description: t(
          "role.overview.OrgRoleSettingsContent.19cfb822",
          "아직 채용을 시작하지 않았습니다."
        ),
        label: t("role.overview.OrgRoleSettingsContent.85160f6c", "작성 중"),
      }
    : lifecycleStatus === "active"
      ? {
          description: t(
            "role.overview.OrgRoleSettingsContent.69ab4392",
            "현재 후보자를 추천받고 채용을 진행하고 있습니다."
          ),
          label: t(
            "role.overview.OrgRoleSettingsContent.1ac8fc2c",
            "채용 진행 중"
          ),
        }
      : lifecycleStatus === "paused"
        ? {
            description: t(
              "role.overview.OrgRoleSettingsContent.1f56c008",
              "후보자 추천을 잠시 멈춘 상태입니다."
            ),
            label: t(
              "role.overview.OrgRoleSettingsContent.4aa053f3",
              "채용 일시정지"
            ),
          }
        : {
            description: t(
              "role.overview.OrgRoleSettingsContent.ae41dfab",
              "채용이 종료되어 후보자를 추천받지 않습니다."
            ),
            label: t(
              "role.overview.OrgRoleSettingsContent.56fe698d",
              "채용 종료"
            ),
          };
  const statusConfirmCopy =
    statusToConfirm === "active"
      ? roleCreation
        ? {
            description: t(
              "role.overview.OrgRoleSettingsContent.682ff28c",
              "Slack 알림 채널과 담당자는 나중에 설정할 수 있습니다. 이 역할의 채용을 진행할까요?"
            ),
            title: t(
              "role.overview.OrgRoleSettingsContent.6b1d3baa",
              "채용을 진행할까요?"
            ),
          }
        : {
            description: t(
              "role.overview.OrgRoleSettingsContent.3408aeeb",
              "후보자 추천을 다시 시작하고 채용을 진행합니다."
            ),
            title: t(
              "role.overview.OrgRoleSettingsContent.42d8e7d8",
              "채용을 다시 진행할까요?"
            ),
          }
      : statusToConfirm === "paused"
        ? {
            description: t(
              "role.overview.OrgRoleSettingsContent.e8766b1d",
              "후보자 추천을 일시정지합니다. 언제든 다시 진행할 수 있습니다."
            ),
            title: t(
              "role.overview.OrgRoleSettingsContent.1012c29a",
              "채용을 일시정지할까요?"
            ),
          }
        : {
            description: t(
              "role.overview.OrgRoleSettingsContent.68a6ae1d",
              "후보자 추천을 종료하고, 현재 연결된 후보자들에게 채용 종료 알림을 보냅니다. 이미 전달된 알림은 다시 채용을 진행해도 되돌릴 수 없습니다."
            ),
            title: t(
              "role.overview.OrgRoleSettingsContent.44a852d9",
              "채용을 종료할까요?"
            ),
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
      addToast({
        message: t(
          "role.overview.OrgRoleSettingsContent.99c692d0",
          "Role 설정을 저장했습니다."
        ),
        variant: "success",
      });
    } catch (error) {
      setSettingsSaveError(
        getRoleOverviewErrorMessage(
          error,
          t(
            "role.overview.OrgRoleSettingsContent.a5f6aa4e",
            "Role 설정을 저장하지 못했습니다."
          )
        )
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
      addToast({
        message: t(
          "role.overview.OrgRoleSettingsContent.4970de57",
          "채용 상태를 변경했습니다."
        ),
        variant: "success",
      });
      setStatusToConfirm(null);
    } catch (error) {
      addToast({
        message: getRoleOverviewErrorMessage(
          error,
          t(
            "role.overview.OrgRoleSettingsContent.604bd6ec",
            "채용 상태를 변경하지 못했습니다."
          )
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
          t(
            "role.overview.OrgRoleSettingsContent.985456b6",
            "역할을 삭제하지 못했습니다."
          )
        ),
        variant: "error",
      });
      return;
    }

    setRoleDeleteConfirmOpen(false);
    addToast({
      message: t(
        "role.overview.OrgRoleSettingsContent.478c7aff",
        "역할을 삭제했습니다."
      ),
      variant: "success",
    });
    void router.push(
      buildOrgHref({ orgId: workspaceId, page: "jobs", roleId: "all" })
    );
  };

  const changeCompanyFirstSearch = async (enabled: boolean) => {
    if (
      !canManage ||
      updateCompanyFirstSearch.isPending ||
      updateRoleStatus.isPending
    )
      return;
    setCompanyFirstSearchError("");

    try {
      await updateCompanyFirstSearch.mutateAsync({
        isCompanyFirstSearch: enabled,
        roleId: role.roleId,
        workspaceId,
      });
      if (!enabled) {
        setScheduleDaysOverride(null);
        setScheduleHourOverride(null);
      }
      addToast({
        message: enabled
          ? t(
              "role.overview.OrgRoleSettingsContent.18b90ff6",
              "정기 후보 검색을 켰습니다."
            )
          : t(
              "role.overview.OrgRoleSettingsContent.52a0084f",
              "정기 후보 검색을 껐습니다."
            ),
        variant: "success",
      });
    } catch (error) {
      setCompanyFirstSearchError(
        getRoleOverviewErrorMessage(
          error,
          t(
            "role.overview.OrgRoleSettingsContent.7e825e96",
            "정기 후보 검색 설정을 저장하지 못했습니다. 다시 시도해 주세요."
          )
        )
      );
    }
  };

  const saveSchedule = async () => {
    if (
      !companyFirstSearchEnabled ||
      !canManage ||
      !scheduleChanged ||
      updateCompanyFirstSearch.isPending
    )
      return;
    setCompanyFirstSearchError("");
    try {
      await updateCompanyFirstSearch.mutateAsync({
        introSearchDate: scheduleDays,
        introSearchTime: scheduleHour,
        roleId: role.roleId,
        workspaceId,
      });
      setScheduleDaysOverride(null);
      setScheduleHourOverride(null);
      addToast({
        message: t(
          "role.overview.OrgRoleSettingsContent.scheduleSaved",
          "검색 일정을 저장했습니다."
        ),
        variant: "success",
      });
    } catch (error) {
      setCompanyFirstSearchError(
        getRoleOverviewErrorMessage(
          error,
          t(
            "role.overview.OrgRoleSettingsContent.scheduleSaveError",
            "검색 일정을 저장하지 못했습니다. 다시 시도해 주세요."
          )
        )
      );
    }
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
            <RoleSectionHeading
              title={t(
                "role.overview.OrgRoleSettingsContent.9b8461a2",
                "Status"
              )}
            />
            <div className="rounded-md bg-bg-basement px-3 py-3 text-sm">
              {statusMeta.label}
              <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
                {statusMeta.description}
              </p>
            </div>
            {roleCreation ? (
              internalOpsAccess ? (
                <MuteButton
                  disabled={!canManage || updateRoleStatus.isPending}
                  onClick={() => setStatusToConfirm("active")}
                  variant="default"
                >
                  <Play className="size-4" />
                  {t(
                    "role.overview.OrgRoleSettingsContent.ba0dad4c",
                    "채용 진행하기"
                  )}
                </MuteButton>
              ) : null
            ) : (
              <div className="flex flex-wrap gap-2">
                {lifecycleStatus === "active" ? (
                  <MuteButton
                    disabled={!canManage || updateRoleStatus.isPending}
                    onClick={() => setStatusToConfirm("paused")}
                  >
                    <Pause className="size-4" />
                    {t(
                      "role.overview.OrgRoleSettingsContent.4aa053f3",
                      "채용 일시정지"
                    )}
                  </MuteButton>
                ) : (
                  <MuteButton
                    disabled={!canManage || updateRoleStatus.isPending}
                    onClick={() => setStatusToConfirm("active")}
                    variant="default"
                  >
                    <Play className="size-4" />
                    {t(
                      "role.overview.OrgRoleSettingsContent.ba0dad4c",
                      "채용 진행하기"
                    )}
                  </MuteButton>
                )}
                {lifecycleStatus !== "ended" ? (
                  <MuteButton
                    disabled={!canManage || updateRoleStatus.isPending}
                    onClick={() => setStatusToConfirm("ended")}
                    variant="warn"
                  >
                    <CircleStop className="size-4" />
                    {t(
                      "role.overview.OrgRoleSettingsContent.ac0ccdc8",
                      "채용 종료하기"
                    )}
                  </MuteButton>
                ) : null}
              </div>
            )}
          </section>

          {settingsQuery.error ? (
            <section className="space-y-3">
              <div className="rounded-md border border-critical/20 bg-critical-faded px-3 py-3 text-[13px] text-critical">
                {getRoleOverviewErrorMessage(
                  settingsQuery.error,
                  t(
                    "role.overview.OrgRoleSettingsContent.b9f19f4c",
                    "Role 설정을 불러오지 못했습니다."
                  )
                )}
              </div>
              <MuteButton onClick={() => void settingsQuery.refetch()}>
                {t(
                  "role.overview.OrgRoleSettingsContent.c2142493",
                  "다시 시도"
                )}
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
                  description={t(
                    "role.overview.OrgRoleSettingsContent.6a0f98e8",
                    "이 역할의 새로운 연결 소식을 받을 Slack 채널을 선택하세요."
                  )}
                  title={t(
                    "role.overview.OrgRoleSettingsContent.9622450d",
                    "알림 채널"
                  )}
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
                          aria-label={t(
                            "role.overview.OrgRoleSettingsContent.2e05f635",
                            "{p0} 알림",
                            {
                              p0: formatChannelName(
                                channel.channelName,
                                channel.channelId
                              ),
                            }
                          )}
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
                  <div className="flex w-full flex-col items-start justify-between gap-3 mt-1 sm:flex-row sm:items-center">
                    <MuteButton asChild variant="default">
                      <Link
                        href={buildOrgHref({
                          orgId: workspaceId,
                          page: "settings",
                        })}
                      >
                        {t(
                          "role.overview.OrgRoleSettingsContent.a48f4536",
                          "Slack 연결"
                        )}
                        <ArrowRight className="size-4" />
                      </Link>
                    </MuteButton>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <RoleSectionHeading
                  description={
                    roleCreation
                      ? t(
                          "role.overview.OrgRoleSettingsContent.2a42cf23",
                          "이 역할의 알림과 후보자 진행을 맡을 담당자를 선택하세요."
                        )
                      : t(
                          "role.overview.OrgRoleSettingsContent.ef5ded84",
                          "이 역할의 후보자 연결을 함께 담당할 멤버를 선택하세요."
                        )
                  }
                  info={t(
                    "role.overview.OrgRoleSettingsContent.d8ef567b",
                    "담당자로 설정한 멤버는 이 역할의 후보자와 연결될 때 소개 이메일 CC에 자동으로 포함됩니다."
                  )}
                  title={t(
                    "role.overview.OrgRoleSettingsContent.9c01f9cd",
                    "담당자"
                  )}
                />
                <div className="flex items-start gap-3 pt-1">
                  <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                    {assignedMembers.map((member) => (
                      <div
                        className="flex min-w-0 max-w-full items-center gap-2 rounded-full bg-black/5 py-1 pr-1 pl-3.5"
                        key={member.userId}
                      >
                        <span className="max-w-36 truncate text-[13px] font-medium text-neutral-primary">
                          {member.name ||
                            t(
                              "role.overview.OrgRoleSettingsContent.439dfda4",
                              "이름 없음"
                            )}
                        </span>
                        <span className="max-w-52 truncate text-[12px] text-neutral-muted">
                          {member.email ||
                            t(
                              "role.overview.OrgRoleSettingsContent.f3674383",
                              "이메일 없음"
                            )}
                        </span>
                        {member.role ? (
                          <span className="max-w-32 truncate text-[12px] text-neutral-soft">
                            {member.role}
                          </span>
                        ) : null}
                        <MuteButton
                          aria-label={t(
                            "role.overview.OrgRoleSettingsContent.4aea62bd",
                            "{p0} 제외",
                            {
                              p0:
                                member.name ||
                                member.email ||
                                t(
                                  "role.overview.OrgRoleSettingsContent.9c01f9cd",
                                  "담당자"
                                ),
                            }
                          )}
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
                            ? t(
                                "role.overview.OrgRoleSettingsContent.161cc7fa",
                                "담당자 변경"
                              )
                            : t(
                                "role.overview.OrgRoleSettingsContent.3685bc8a",
                                "담당자 추가"
                              )}
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
                                  {member.name ||
                                    member.email ||
                                    t(
                                      "role.overview.OrgRoleSettingsContent.439dfda4",
                                      "이름 없음"
                                    )}
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
                            {t(
                              "role.overview.OrgRoleSettingsContent.85c9b083",
                              "추가할 수 있는 멤버가 없습니다."
                            )}
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
            title="Context for Harper"
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

      {showRoleDeletion ? (
        <OrgSection>
          <OrgSectionHeader
            title={t(
              "role.overview.OrgRoleSettingsContent.2c72320b",
              "역할 삭제"
            )}
          />
          <MuteButton
            disabled={!canManage || hasChanges || updateRoleStatus.isPending}
            onClick={() => setRoleDeleteConfirmOpen(true)}
            title={
              hasChanges
                ? t(
                    "role.overview.OrgRoleSettingsContent.9a9afcd0",
                    "변경사항을 저장하거나 취소한 후 삭제할 수 있습니다."
                  )
                : undefined
            }
            variant="warn"
          >
            <Trash2 className="size-3" />
            {t(
              "role.overview.OrgRoleSettingsContent.4d1f132d",
              "역할 삭제하기"
            )}
          </MuteButton>
          {hasChanges ? (
            <p className="mt-2 text-[12px] leading-5 text-neutral-muted">
              {t(
                "role.overview.OrgRoleSettingsContent.9a9afcd0",
                "변경사항을 저장하거나 취소한 후 삭제할 수 있습니다."
              )}
            </p>
          ) : null}
        </OrgSection>
      ) : null}

      <OrgSection>
        <div className="mt-6 divide-y divide-neutral-1000-a05 px-4 rounded-md bg-neutral-100">
          <div className="flex items-start justify-between gap-6 py-5">
            <RoleSectionHeading
              description={t(
                "role.overview.OrgRoleSettingsContent.33d36939",
                "Harper가 정기적으로 잠재 후보자를 찾아 ‘먼저 제안 가능한 후보’에 표시해요. 연락하고 싶은 후보자가 있다면 ‘Intro 요청’을 눌러 주세요. 이 설정을 꺼도 Harper는 후보자에게 역할을 추천할 수 있으며, 회사에는 수락한 후보자만 보여드려요."
              )}
              info={t(
                "role.overview.OrgRoleSettingsContent.822f041c",
                "켜짐: Harper가 정기적으로 잠재 후보자를 찾아 ‘먼저 제안 가능한 후보’에 표시해요. ‘Intro 요청’을 누르면 Harper가 후보자에게 연락해요. 꺼짐: Harper는 후보자에게 역할을 먼저 추천할 수 있고, 회사에는 수락한 후보자만 보여드려요."
              )}
              title={t(
                "role.overview.OrgRoleSettingsContent.adbf70e1",
                "추천 후보 검색"
              )}
            />
            <div className="flex min-h-6 shrink-0 items-center gap-2">
              {updateCompanyFirstSearch.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 animate-spin text-neutral-muted"
                />
              ) : null}
              <span className="text-[12px] text-neutral-muted">
                {companyFirstSearchEnabled
                  ? t("role.overview.OrgRoleSettingsContent.9a89d1f5", "켜짐")
                  : t("role.overview.OrgRoleSettingsContent.60895fe9", "꺼짐")}
              </span>
              <AppleSwitch
                aria-label={t(
                  "role.overview.OrgRoleSettingsContent.adbf70e1",
                  "추천 후보 검색"
                )}
                checked={companyFirstSearchEnabled}
                disabled={
                  !canManage ||
                  updateCompanyFirstSearch.isPending ||
                  updateRoleStatus.isPending
                }
                onCheckedChange={(enabled) =>
                  void changeCompanyFirstSearch(enabled)
                }
              />
            </div>
          </div>
          <div className="grid gap-3 py-5 sm:grid-cols-[minmax(180px,1fr)_auto] sm:items-center">
            <div>
              <div
                className={cn(
                  "text-sm font-medium",
                  companyFirstSearchEnabled
                    ? "text-neutral-primary"
                    : "text-neutral-disabled"
                )}
              >
                {t(
                  "role.overview.OrgRoleSettingsContent.scheduleDays",
                  "검색 요일"
                )}
              </div>
              <p className="mt-1 text-[13px] text-neutral-muted">
                {companyFirstSearchEnabled
                  ? t(
                      "role.overview.OrgRoleSettingsContent.scheduleDaysDescription",
                      "이 요일에 새 후보자를 검색합니다."
                    )
                  : t(
                      "role.overview.OrgRoleSettingsContent.scheduleDaysDisabledDescription",
                      "검색을 켜면 이 요일에 다시 검색합니다."
                    )}
              </p>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t(
                "role.overview.OrgRoleSettingsContent.scheduleDays",
                "검색 요일"
              )}
            >
              {INTRO_SEARCH_DAYS.map((day) => {
                const selected = scheduleDays.includes(day);
                return (
                  <MuteButton
                    key={day}
                    aria-pressed={selected}
                    disabled={scheduleDisabled}
                    onClick={() => {
                      const next = selected
                        ? scheduleDays.filter((value) => value !== day)
                        : INTRO_SEARCH_DAYS.filter(
                            (value) =>
                              value === day || scheduleDays.includes(value)
                          );
                      if (next.length) setScheduleDaysOverride(next);
                    }}
                    size="sm"
                    variant={selected ? "dark" : "default"}
                  >
                    {day}
                  </MuteButton>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 py-5 sm:grid-cols-[minmax(180px,1fr)_auto] sm:items-center">
            <div>
              <div
                className={cn(
                  "text-sm font-medium",
                  companyFirstSearchEnabled
                    ? "text-neutral-primary"
                    : "text-neutral-disabled"
                )}
              >
                {t(
                  "role.overview.OrgRoleSettingsContent.scheduleTime",
                  "검색 시간"
                )}
              </div>
              <p className="mt-1 text-[13px] text-neutral-muted">
                {companyFirstSearchEnabled
                  ? t(
                      "role.overview.OrgRoleSettingsContent.scheduleTimeDescription",
                      "설정한 요일의 이 시간에 검색을 시작합니다."
                    )
                  : t(
                      "role.overview.OrgRoleSettingsContent.scheduleTimeDisabledDescription",
                      "검색을 켜면 이 시간에 다시 검색합니다."
                    )}
              </p>
            </div>
            <div className="w-40 sm:text-right">
              <Select
                disabled={scheduleDisabled}
                items={Array.from({ length: 24 }, (_, hour) => ({
                  label: formatHour(hour),
                  value: String(hour),
                }))}
                value={String(scheduleHour)}
                onValueChange={(value) => {
                  if (value != null) setScheduleHourOverride(Number(value));
                }}
              >
                <SelectTrigger
                  aria-label={t(
                    "role.overview.OrgRoleSettingsContent.scheduleTime",
                    "검색 시간"
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {formatHour(hour)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p
                className={cn(
                  "mt-1 text-[12px]",
                  companyFirstSearchEnabled
                    ? "text-neutral-muted"
                    : "text-neutral-disabled"
                )}
              >
                GMT+9 (Asia/Seoul)
              </p>
            </div>
          </div>
        </div>
        {canManage && companyFirstSearchEnabled && scheduleChanged ? (
          <div className="flex justify-end gap-2">
            <MuteButton
              disabled={updateCompanyFirstSearch.isPending}
              onClick={() => {
                setScheduleDaysOverride(null);
                setScheduleHourOverride(null);
              }}
            >
              {t("role.overview.OrgRoleSettingsContent.scheduleCancel", "취소")}
            </MuteButton>
            <MuteButton
              disabled={updateCompanyFirstSearch.isPending}
              onClick={() => void saveSchedule()}
              variant="dark"
            >
              {t(
                "role.overview.OrgRoleSettingsContent.scheduleSave",
                "일정 저장"
              )}
            </MuteButton>
          </div>
        ) : null}
        {companyFirstSearchError ? (
          <p className="mt-3 text-[13px] text-critical" role="alert">
            {companyFirstSearchError}
          </p>
        ) : null}
      </OrgSection>

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
              {t("role.overview.OrgRoleSettingsContent.72b94fe1", "취소")}
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
                ? t(
                    "role.overview.OrgRoleSettingsContent.ba0dad4c",
                    "채용 진행하기"
                  )
                : statusToConfirm === "paused"
                  ? t(
                      "role.overview.OrgRoleSettingsContent.1da82cc0",
                      "일시정지"
                    )
                  : t(
                      "role.overview.OrgRoleSettingsContent.ac0ccdc8",
                      "채용 종료하기"
                    )}
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
            <DialogTitle className="text-[17px]">
              {t("role.overview.OrgRoleSettingsContent.2c72320b", "역할 삭제")}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              {t(
                "composed.deleteRole",
                "“{roleName}” 역할을 삭제합니다. 계속할까요?",
                { roleName: role.name }
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <MuteButton
              disabled={updateRoleStatus.isPending}
              onClick={() => setRoleDeleteConfirmOpen(false)}
              size="lg"
            >
              {t("role.overview.OrgRoleSettingsContent.72b94fe1", "취소")}
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
              {t("role.overview.OrgRoleSettingsContent.159f1f79", "삭제")}
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
