import { SlackLogo as SlackIcon } from "@/components/common/BrandLogos";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import {
  canAccessOrgRole,
  resolveOrgRoleAccess,
} from "@/lib/org/teamAccess.shared";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowRight,
  CircleStop,
  LoaderCircle,
  Mail,
  Pause,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { OrgSlackCreateChannelDialog } from "@/components/org/OrgSlackCreateChannelDialog";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { MuteButton } from "@/components/ui/button";

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
import { useOrgSlackStatus } from "@/hooks/org/useOrgSlack";
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
  useRoleOverviewErrorMessage,
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
  const getRoleOverviewErrorMessage = useRoleOverviewErrorMessage();
  const router = useRouter();
  const {
    bootstrap: { members },
    internalOpsAccess,
    permissions,
    workspace,
  } = useOrgWorkspace();
  const canManage = permissions.canManageCandidates;
  const addToast = useToastStore((state) => state.add);
  const updateRoleStatus = useUpdateOrgRole();
  const updateCompanyFirstSearch = useUpdateOrgRole();
  const updatePromotion = useUpdateOrgRole();
  const updateAnonymity = useUpdateOrgRole();
  const updateNotifications = useUpdateOrgRoleNotificationSettings();
  const settingsQuery = useOrgRoleNotificationSettings({
    roleId: role.roleId,
    workspaceId,
  });
  const slackStatusQuery = useOrgSlackStatus({
    enabled: canManage,
    workspaceId,
  });
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [settingsEditing, setSettingsEditing] = useState(false);
  const [channelOverrides, setChannelOverrides] = useState<
    Record<string, boolean>
  >({});
  const [assigneeOverride, setAssigneeOverride] = useState<string[] | null>(
    null
  );
  const [emailOverride, setEmailOverride] = useState<boolean | null>(null);
  const { locale, c } = useOrgLocale();
  const [statusToConfirm, setStatusToConfirm] = useState<OrgRoleStatus | null>(
    null
  );
  const [roleDeleteConfirmOpen, setRoleDeleteConfirmOpen] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState("");
  const [companyFirstSearchError, setCompanyFirstSearchError] = useState("");
  const [promotionError, setPromotionError] = useState("");
  const [anonymityError, setAnonymityError] = useState("");
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
  const promotionEnabled =
    updatePromotion.isPending &&
    typeof updatePromotion.variables?.isPromote === "boolean"
      ? updatePromotion.variables.isPromote
      : role.isPromote === true;
  const anonymousEnabled =
    updateAnonymity.isPending &&
    typeof updateAnonymity.variables?.isAnonymous === "boolean"
      ? updateAnonymity.variables.isAnonymous
      : role.isAnonymous === true;
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
  const emailEnabled =
    emailOverride ?? settingsQuery.data?.emailEnabled ?? false;
  const emailChanged =
    emailOverride !== null &&
    emailOverride !== (settingsQuery.data?.emailEnabled ?? false);
  const notificationChanged =
    Object.keys(channelOverrides).length > 0 || emailChanged;
  const assigneeUserIds =
    assigneeOverride ?? settingsQuery.data?.assigneeUserIds ?? [];
  const assigneeChanged =
    assigneeOverride !== null &&
    JSON.stringify([...assigneeOverride].sort()) !==
      JSON.stringify([...(settingsQuery.data?.assigneeUserIds ?? [])].sort());
  const hasChanges = notificationChanged || assigneeChanged;
  const settingsPending = updateNotifications.isPending;
  const slackConnected =
    slackStatusQuery.data?.connected ?? (channels?.length ?? 0) > 0;
  const canCreateSlackChannel =
    slackStatusQuery.data?.canCreateChannels ?? (channels?.length ?? 0) > 0;

  useUnsavedChangesWarning(hasChanges || scheduleChanged, {
    preserveWithinRole: true,
  });

  const assignedMembers = assigneeUserIds.flatMap((userId) => {
    const member = members.find((item) => item.userId === userId);
    return member ? [member] : [];
  });
  const assignableMembers = members.filter(
    (member) =>
      member.email &&
      !assigneeUserIds.includes(member.userId) &&
      canAccessOrgRole(
        resolveOrgRoleAccess({
          authority: member.authority,
          access_scope: member.accessScope,
          team_id: member.teamId,
        }),
        role.teamId
      )
  );
  const initialStatus = normalizeOrgRoleStatus(role.status);
  const lifecycleStatus =
    initialStatus === "top_priority" ? "active" : initialStatus;
  const showRoleDeletion =
    layout === "panel" && (roleCreation || lifecycleStatus === "ended");
  const statusMeta = roleCreation
    ? {
        description: c(
          "아직 채용을 시작하지 않았습니다.",
          "Hiring not started yet."
        ),
        label: c("작성 중", "In draft"),
      }
    : lifecycleStatus === "active"
      ? {
          description: c(
            "현재 후보자를 추천받고 채용을 진행하고 있습니다.",
            "This role is open for hiring and can receive candidate recommendations."
          ),
          label: c("채용 진행 중", "Hiring in progress"),
        }
      : lifecycleStatus === "paused"
        ? {
            description: c(
              "후보자 추천을 잠시 멈춘 상태입니다.",
              "Candidate recommendations are paused."
            ),
            label: c("채용 일시정지", "Hiring paused"),
          }
        : {
            description: c(
              "채용이 종료되어 후보자를 추천받지 않습니다.",
              "Hiring has ended. This role no longer receives new recommendations."
            ),
            label: c("채용 종료", "Hiring ended"),
          };
  const statusConfirmCopy =
    statusToConfirm === "active"
      ? roleCreation
        ? {
            description: c(
              "이 역할의 채용을 시작하고 후보자 추천을 받을까요?",
              "Start hiring and receiving candidate recommendations for this role?"
            ),
            title: c("채용을 진행할까요?", "Start hiring?"),
          }
        : {
            description: c(
              "후보자 추천을 다시 시작하고 채용을 진행합니다.",
              "Resume hiring and candidate recommendations for this role."
            ),
            title: c("채용을 다시 진행할까요?", "Resume hiring?"),
          }
      : statusToConfirm === "paused"
        ? {
            description: c(
              "후보자 추천을 일시정지합니다. 언제든 다시 진행할 수 있습니다.",
              "Pause new recommendations. You can resume hiring at any time."
            ),
            title: c("채용을 일시정지할까요?", "Pause hiring?"),
          }
        : {
            description: c(
              "후보자 추천을 종료하고, 현재 연결된 후보자들에게 채용 종료 알림을 보냅니다. 이미 전달된 알림은 다시 채용을 진행해도 되돌릴 수 없습니다.",
              "Stop candidate recommendations and send closing notifications to currently connected candidates. Notifications already sent cannot be undone if hiring resumes."
            ),
            title: c("채용을 종료할까요?", "End hiring?"),
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
    setEmailOverride(null);
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
        ...(emailChanged ? { emailEnabled } : {}),
        roleId: role.roleId,
        workspaceId,
      });
      setChannelOverrides({});
      setAssigneeOverride(null);
      setEmailOverride(null);
      setSettingsEditing(false);
      addToast({
        message: c("Role 설정을 저장했습니다.", "Role settings saved."),
        variant: "success",
      });
    } catch (error) {
      setSettingsSaveError(
        getRoleOverviewErrorMessage(
          error,
          c("Role 설정을 저장하지 못했습니다.", "Failed to save role settings.")
        )
      );
    }
  };

  const requestHiringStart = async () => {
    if (!canManage || updateRoleStatus.isPending || settingsPending) return;
    const settings = await settingsQuery.refetch();
    if (settings.isError || !settings.data) {
      addToast({
        message: c(
          "담당자 설정을 확인하지 못했습니다. 다시 시도해 주세요.",
          "Could not check the role owner. Please try again."
        ),
        variant: "error",
      });
      return;
    }
    if (settings.data.assigneeUserIds.length === 0) {
      addToast({
        message: c(
          "채용을 시작하려면 담당자를 설정하고 저장해 주세요.",
          "Set and save a role owner before starting hiring."
        ),
        variant: "error",
      });
      return;
    }
    setStatusToConfirm("active");
  };

  const confirmStatusChange = async () => {
    if (!statusToConfirm || updateRoleStatus.isPending) return;
    try {
      await updateRoleStatus.mutateAsync({
        roleId: role.roleId,
        status: statusToConfirm,
        workspaceId,
      });
      if (statusToConfirm !== "active") {
        addToast({
          message: c("채용 상태를 변경했습니다.", "Hiring status updated."),
          variant: "success",
        });
      }
      setStatusToConfirm(null);
    } catch (error) {
      addToast({
        message: getRoleOverviewErrorMessage(
          error,
          c(
            "채용 상태를 변경하지 못했습니다.",
            "Failed to update hiring status."
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
          c("역할을 삭제하지 못했습니다.", "Failed to delete role.")
        ),
        variant: "error",
      });
      return;
    }

    setRoleDeleteConfirmOpen(false);
    addToast({
      message: c("역할을 삭제했습니다.", "Role deleted."),
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
          ? c("정기 후보 검색을 켰습니다.", "Scheduled candidate search is on.")
          : c(
              "정기 후보 검색을 껐습니다.",
              "Scheduled candidate search is off."
            ),
        variant: "success",
      });
    } catch (error) {
      setCompanyFirstSearchError(
        getRoleOverviewErrorMessage(
          error,
          c(
            "정기 후보 검색 설정을 저장하지 못했습니다. 다시 시도해 주세요.",
            "We couldn't update scheduled candidate search. Try again."
          )
        )
      );
    }
  };

  const changePromotion = async (enabled: boolean) => {
    if (!canManage || updatePromotion.isPending || updateRoleStatus.isPending)
      return;
    setPromotionError("");
    try {
      await updatePromotion.mutateAsync({
        isPromote: enabled,
        roleId: role.roleId,
        workspaceId,
      });
      addToast({
        message: c(
          "공개 공고 설정을 저장했습니다.",
          "Public job setting saved."
        ),
        variant: "success",
      });
    } catch (error) {
      setPromotionError(
        getRoleOverviewErrorMessage(
          error,
          c(
            "공개 공고 설정을 저장하지 못했습니다. 다시 시도해 주세요.",
            "Couldn't save the public job setting. Try again."
          )
        )
      );
    }
  };

  const changeAnonymity = async (enabled: boolean) => {
    if (!canManage || updateAnonymity.isPending || updateRoleStatus.isPending)
      return;
    setAnonymityError("");
    try {
      await updateAnonymity.mutateAsync({
        isAnonymous: enabled,
        roleId: role.roleId,
        workspaceId,
      });
      addToast({
        message: c(
          "회사명 공개 설정을 저장했습니다.",
          "Company name visibility saved."
        ),
        variant: "success",
      });
    } catch (error) {
      setAnonymityError(
        getRoleOverviewErrorMessage(
          error,
          c(
            "회사명 공개 설정을 저장하지 못했습니다. 다시 시도해 주세요.",
            "Couldn't save company name visibility. Try again."
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
        message: c("검색 일정을 저장했습니다.", "Search schedule saved."),
        variant: "success",
      });
    } catch (error) {
      setCompanyFirstSearchError(
        getRoleOverviewErrorMessage(
          error,
          c(
            "검색 일정을 저장하지 못했습니다. 다시 시도해 주세요.",
            "Could not save the search schedule. Please try again."
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
            <RoleSectionHeading title={c("Status", "Status")} />
            <div className="rounded-md bg-bg-basement px-3 py-3 text-sm">
              {statusMeta.label}
              <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
                {statusMeta.description}
              </p>
            </div>
            {roleCreation ? (
              canManage ? (
                <MuteButton
                  disabled={
                    !canManage ||
                    updateRoleStatus.isPending ||
                    settingsPending ||
                    settingsQuery.isFetching
                  }
                  onClick={() => void requestHiringStart()}
                  variant="default"
                >
                  <Play className="size-4" />
                  {c("채용 진행하기", "Start hiring")}
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
                    {c("채용 일시정지", "Hiring paused")}
                  </MuteButton>
                ) : (
                  <MuteButton
                    disabled={!canManage || updateRoleStatus.isPending}
                    onClick={() => setStatusToConfirm("active")}
                    variant="default"
                  >
                    <Play className="size-4" />
                    {c("채용 진행하기", "Start hiring")}
                  </MuteButton>
                )}
                {lifecycleStatus !== "ended" ? (
                  <MuteButton
                    disabled={!canManage || updateRoleStatus.isPending}
                    onClick={() => setStatusToConfirm("ended")}
                    variant="warn"
                  >
                    <CircleStop className="size-4" />
                    {c("채용 종료하기", "End hiring")}
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
                  c(
                    "Role 설정을 불러오지 못했습니다.",
                    "Failed to load role settings."
                  )
                )}
              </div>
              <MuteButton onClick={() => void settingsQuery.refetch()}>
                {c("다시 시도", "Retry")}
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
                  description={c(
                    "이 역할과 관련해 Harper와 소통할 Slack 채널을 선택하세요.",
                    "Choose a Slack channel to receive updates about this role from Harper."
                  )}
                  title={c("슬랙 연결", "Connect Slack")}
                />
                {/* <div className="flex items-center gap-3 py-1">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-neutral-1000-a05 text-neutral-muted">
                    <Mail className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-normal text-neutral-primary">
                      {c("메일", "Email")}
                    </div>
                  </div>
                  <Switch
                    aria-label={c("메일 알림", "Email notifications")}
                    checked={emailEnabled}
                    className="data-[state=checked]:bg-positive"
                    disabled={!canManage || settingsPending}
                    onCheckedChange={(enabled) => {
                      if (!canManage || settingsPending) return;
                      setSettingsEditing(true);
                      setSettingsSaveError("");
                      setEmailOverride(
                        enabled === (settingsQuery.data?.emailEnabled ?? false)
                          ? null
                          : enabled
                      );
                    }}
                  />
                </div> */}
                {channels.length > 0 ? (
                  <div className="divide-y divide-neutral-1000-a05 bg-bg-default">
                    {channels.map((channel) => (
                      <div
                        className="flex items-center gap-3 py-1"
                        key={channel.channelId}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-1000-a05 text-neutral-muted">
                          <SlackIcon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1 truncate text-[14px] font-normal text-neutral-primary">
                          {formatChannelName(
                            channel.channelName,
                            channel.channelId
                          )}
                        </div>
                        <Switch
                          aria-label={c("{p0} 알림", "{p0} notifications", {
                            p0: formatChannelName(
                              channel.channelName,
                              channel.channelId
                            ),
                          })}
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
                ) : !slackConnected ? (
                  <div className="flex w-full flex-col items-start justify-between gap-3 mt-1 sm:flex-row sm:items-center">
                    <MuteButton asChild variant="default">
                      <Link
                        href={buildOrgHref({
                          orgId: workspaceId,
                          page: "settings",
                        })}
                      >
                        {c("Slack 연결", "Slack connection")}
                        <ArrowRight className="size-4" />
                      </Link>
                    </MuteButton>
                  </div>
                ) : null}
                {canManage && slackConnected ? (
                  canCreateSlackChannel ? (
                    <MuteButton
                      disabled={settingsPending}
                      onClick={() => setCreateChannelOpen(true)}
                      size="sm"
                    >
                      <Plus className="size-3.5" />
                      {c("새 채널 만들기", "Create new channel")}
                    </MuteButton>
                  ) : (
                    <MuteButton asChild size="sm">
                      <Link
                        href={buildOrgHref({
                          orgId: workspaceId,
                          page: "settings",
                        })}
                      >
                        {c(
                          "채널 생성 권한 추가하기",
                          "Grant channel creation permission"
                        )}
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </MuteButton>
                  )
                ) : null}
              </div>

              <div className="space-y-2">
                <RoleSectionHeading
                  description={
                    roleCreation
                      ? c(
                          "이 역할의 알림과 후보자 진행을 맡을 담당자를 선택하세요.",
                          "Choose team members to manage notifications and hiring progress for this role."
                        )
                      : c(
                          "이 역할의 후보자 연결을 함께 담당할 멤버를 선택하세요.",
                          "Choose teammates to manage candidate intros for this role."
                        )
                  }
                  info={c(
                    "담당자로 설정한 멤버는 이 역할의 후보자와 연결될 때 소개 이메일 CC에 자동으로 포함됩니다.",
                    "Role owners are automatically CC'd on introduction emails for this role."
                  )}
                  title={c("담당자", "Owners")}
                />
                <div className="flex items-start gap-3 pt-1">
                  <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                    {assignedMembers.map((member) => (
                      <div
                        className="flex min-w-0 max-w-full items-center gap-2 rounded-full bg-black/5 py-1 pr-1 pl-3.5"
                        key={member.userId}
                      >
                        <span className="max-w-36 truncate text-[13px] font-medium text-neutral-primary">
                          {member.name || c("이름 없음", "No name")}
                        </span>
                        <span className="max-w-52 truncate text-[12px] text-neutral-muted">
                          {member.email || c("이메일 없음", "No email")}
                        </span>
                        {member.role ? (
                          <span className="max-w-32 truncate text-[12px] text-neutral-soft">
                            {member.role}
                          </span>
                        ) : null}
                        <MuteButton
                          aria-label={c("{p0} 제외", "Exclude {p0}", {
                            p0:
                              member.name ||
                              member.email ||
                              c("담당자", "Owners"),
                          })}
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
                            ? c("담당자 변경", "Change owner")
                            : c("담당자 추가", "Add owner")}
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
                                    c("이름 없음", "No name")}
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
                            {c(
                              "추가할 수 있는 멤버가 없습니다.",
                              "No members available to add."
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
          <OrgSectionHeader title={c("역할 삭제", "Delete role")} />
          <MuteButton
            disabled={!canManage || hasChanges || updateRoleStatus.isPending}
            onClick={() => setRoleDeleteConfirmOpen(true)}
            title={
              hasChanges
                ? c(
                    "변경사항을 저장하거나 취소한 후 삭제할 수 있습니다.",
                    "Save or cancel changes before deleting."
                  )
                : undefined
            }
            variant="warn"
          >
            <Trash2 className="size-3" />
            {c("역할 삭제하기", "Delete role")}
          </MuteButton>
          {hasChanges ? (
            <p className="mt-2 text-[12px] leading-5 text-neutral-muted">
              {c(
                "변경사항을 저장하거나 취소한 후 삭제할 수 있습니다.",
                "Save or cancel changes before deleting."
              )}
            </p>
          ) : null}
        </OrgSection>
      ) : null}

      <OrgSection>
        <div className="mt-6 divide-y divide-neutral-1000-a05 px-4 rounded-md bg-neutral-100">
          <div className="flex items-start justify-between gap-6 py-5">
            <RoleSectionHeading
              description={c(
                "Harper가 정기적으로 연락해보실만한 후보자를 찾아 알려드려요. 연락하고 싶은 후보자가 있다면 ‘Send Intro’를 눌러 주세요.",
                "Harper searches for candidates your team can reach out to on your schedule. Choose Send Intro when you'd like Harper to reach out. Turning this off doesn't stop Harper from recommending eligible roles to candidates and introducing those who want to talk."
              )}
              info={c(
                "켜짐: Harper가 정기적으로 연락해보실만한 후보자를 찾아 알려드려요. ‘Send Intro’를 누르면 Harper가 후보자에게 연락해요. 꺼짐: Harper는 후보자에게 역할을 먼저 추천할 수 있고, 회사에는 수락한 후보자만 보여드려요.",
                "When this is on, Harper searches for candidates your team can approach. Turning it off stops scheduled searches, but eligible roles can still receive introductions from candidates who have expressed interest."
              )}
              title={c("추천 후보 검색", "Scheduled candidate search")}
            />
            <div className="flex min-h-6 shrink-0 items-center gap-2">
              {updateCompanyFirstSearch.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 animate-spin text-neutral-muted"
                />
              ) : null}
              <span className="text-[12px] text-neutral-muted">
                {companyFirstSearchEnabled ? c("켜짐", "On") : c("꺼짐", "Off")}
              </span>
              <AppleSwitch
                aria-label={c("추천 후보 검색", "Scheduled candidate search")}
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
                {c("검색 요일", "Search on")}
              </div>
              <p className="mt-1 text-[13px] text-neutral-muted">
                {companyFirstSearchEnabled
                  ? c(
                      "이 요일에 새 후보자를 검색합니다.",
                      "Days Harper searches for new candidates."
                    )
                  : c(
                      "검색을 켜면 이 요일에 다시 검색합니다.",
                      "Turn on scheduled candidate search to use these days."
                    )}
              </p>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={c("검색 요일", "Search on")}
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
                {c("검색 시간", "Search at")}
              </div>
              <p className="mt-1 text-[13px] text-neutral-muted">
                <></>
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
                <SelectTrigger aria-label={c("검색 시간", "Search at")}>
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
              {c("취소", "Cancel")}
            </MuteButton>
            <MuteButton
              disabled={updateCompanyFirstSearch.isPending}
              onClick={() => void saveSchedule()}
              variant="dark"
            >
              {c("일정 저장", "Save schedule")}
            </MuteButton>
          </div>
        ) : null}
        {companyFirstSearchError ? (
          <p className="mt-3 text-[13px] text-critical" role="alert">
            {companyFirstSearchError}
          </p>
        ) : null}
      </OrgSection>

      <OrgSection>
        <div className="rounded-md bg-neutral-100 px-4 py-5">
          <div className="flex items-start justify-between gap-6">
            <RoleSectionHeading
              title={c("외부 공고 노출", "Public job promotion")}
              description={c(
                "Harper가 이 역할에 더 적합한 인재를 찾기 위해 LinkedIn 등 외부에 채용 정보를 소개할 수 있어요.",
                "Harper may share this role on LinkedIn and other public channels to find more suitable candidates."
              )}
            />
            <div className="flex min-h-6 shrink-0 items-center gap-2">
              {updatePromotion.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 animate-spin text-neutral-muted"
                />
              ) : null}
              <span className="text-[12px] text-neutral-muted">
                {promotionEnabled ? c("켜짐", "On") : c("꺼짐", "Off")}
              </span>
              <AppleSwitch
                aria-label={c("외부 공고 노출", "Public job promotion")}
                checked={promotionEnabled}
                disabled={
                  !canManage ||
                  updatePromotion.isPending ||
                  updateRoleStatus.isPending
                }
                onCheckedChange={(enabled) => void changePromotion(enabled)}
              />
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-4 border-t border-neutral-1000-a10 pt-5">
              <div className="max-w-xl">
                <p className="text-[14px] font-medium text-neutral-primary">
                  {c("회사명 공개 여부", "Company name visibility")}
                </p>
              </div>
              <div className="flex min-h-6 shrink-0 items-center gap-2">
                {updateAnonymity.isPending ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3.5 animate-spin text-neutral-muted"
                  />
                ) : null}
                <AppleSwitch
                  aria-label={c("회사명 공개 여부", "Company name visibility")}
                  checked={anonymousEnabled}
                  disabled={
                    !canManage ||
                    updateAnonymity.isPending ||
                    updateRoleStatus.isPending
                  }
                  onCheckedChange={(enabled) => void changeAnonymity(enabled)}
                />
              </div>
            </div>
            <p className="text-[12px] text-neutral-muted">
              {c("예시", "Example")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-neutral-1000-a05 bg-bg-default px-3 py-3">
              <Image
                alt=""
                className="size-8 shrink-0"
                height={32}
                src="/images/logos/linkedin2.svg"
                width={32}
              />
              <div className="min-w-0 flex-1 basis-36">
                <p className="text-[12px] text-neutral-muted">
                  {c("LinkedIn 채용 공고", "LinkedIn job post")}
                </p>
                <p className="truncate text-[13px] font-medium text-neutral-primary">
                  {role.name} at{" "}
                  {anonymousEnabled
                    ? c("비공개 회사", "Confidential company")
                    : workspace.companyName}
                </p>
              </div>
              <ArrowRight
                aria-hidden="true"
                className="size-4 text-neutral-soft"
              />
              <span className="text-[13px] font-medium text-neutral-primary">
                {c("지원하기", "Apply")}
              </span>
            </div>
          </div>
        </div>
        {anonymityError ? (
          <p className="mt-3 text-[13px] text-critical" role="alert">
            {anonymityError}
          </p>
        ) : null}
        {promotionError ? (
          <p className="mt-3 text-[13px] text-critical" role="alert">
            {promotionError}
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

      {createChannelOpen ? (
        <OrgSlackCreateChannelDialog
          onCreated={() => void settingsQuery.refetch()}
          onOpenChange={setCreateChannelOpen}
          open
          workspaceId={workspaceId}
        />
      ) : null}

      <TalentCareerModal
        open={Boolean(statusToConfirm)}
        onClose={() => {
          if (!updateRoleStatus.isPending) {
            setStatusToConfirm(null);
          }
        }}
        mobileBottomSheet
        title={<>{statusConfirmCopy.title}</>}
        description={<>{statusConfirmCopy.description}</>}
        panelClassName="max-w-sm"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton
              disabled={updateRoleStatus.isPending}
              onClick={() => setStatusToConfirm(null)}
              size="lg"
            >
              {c("취소", "Cancel")}
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
                ? c("채용 진행하기", "Start hiring")
                : statusToConfirm === "paused"
                  ? c("일시정지", "Pause")
                  : c("채용 종료하기", "End hiring")}
            </MuteButton>
          </div>
        }
      >
        <></>
      </TalentCareerModal>

      <TalentCareerModal
        open={roleDeleteConfirmOpen}
        onClose={() => {
          if (!updateRoleStatus.isPending) {
            setRoleDeleteConfirmOpen(false);
          }
        }}
        mobileBottomSheet
        title={<>{c("역할 삭제", "Delete role")}</>}
        description={
          <>
            {c(
              "“{roleName}” 역할을 삭제합니다. 계속할까요?",
              "Delete the “{roleName}” role?",
              { roleName: role.name }
            )}
          </>
        }
        panelClassName="max-w-sm"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton
              disabled={updateRoleStatus.isPending}
              onClick={() => setRoleDeleteConfirmOpen(false)}
              size="lg"
            >
              {c("취소", "Cancel")}
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
              {c("삭제", "Delete")}
            </MuteButton>
          </div>
        }
      >
        <></>
      </TalentCareerModal>
    </div>
  );
}
