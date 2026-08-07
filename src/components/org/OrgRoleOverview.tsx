import Link from "next/link";
import {
  ArrowRight,
  CircleStop,
  Info,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  SlackIcon,
  X,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { opsTheme } from "@/components/ops/theme";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { Badge } from "@/components/ui/badge";
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
import {
  InlineEditableInput,
  InlineEditableSelect,
  InlineEditableTextarea,
  InlineEditableValue,
} from "@/components/ui/inline-editable";
import RichText from "@/components/ui/rich-text";
import { Switch } from "@/components/ui/switch";
import { Tooltips } from "@/components/ui/tooltip";
import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import { useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import {
  useOrgRoleNotificationSettings,
  useUpdateOrgRoleNotificationSettings,
} from "@/hooks/org/useOrgRoleNotifications";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useUnsavedChangesWarning } from "@/hooks/org/useUnsavedChangesWarning";
import { buildOrgHref } from "@/lib/org/routes";
import {
  normalizeOrgRoleStatus,
  type OrgRoleStatus,
} from "@/lib/org/roleStatus";
import type { OrgRole } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";

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

type RoleDraft = {
  description: string;
  employmentTypes: string[];
  externalJdUrl: string;
  locationText: string;
  name: string;
  request: string;
  salaryRange: string;
  workMode: string;
};

type RoleEditingField =
  | "description"
  | "employmentTypes"
  | "externalJdUrl"
  | "locationText"
  | "name"
  | "request"
  | "salaryRange"
  | "workMode";

function toRoleDraft(role: OrgRole): RoleDraft {
  return {
    description: role.description ?? "",
    employmentTypes: [...role.employmentTypes],
    externalJdUrl: role.externalJdUrl ?? "",
    locationText: role.locationText ?? "",
    name: role.name,
    request: role.request ?? "",
    salaryRange: role.salaryRange ?? "",
    workMode: role.workMode ?? "",
  };
}

function normalizeRoleDraft(draft: RoleDraft) {
  return {
    ...draft,
    employmentTypes: [...draft.employmentTypes].sort(),
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatChannelName(name: string | null, channelId: string) {
  const value = name?.trim() || channelId;
  return value.startsWith("#") ? value : `#${value}`;
}

function SectionHeading({
  description,
  info,
  title,
}: {
  description: string;
  info?: string;
  title: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <h3 className="text-[14px] font-medium text-neutral-primary">
          {title}
        </h3>
        {info ? (
          <Tooltips side="right" text={info}>
            <span
              aria-label={`${title} 안내`}
              className="inline-flex cursor-help text-neutral-soft hover:text-neutral-primary"
              role="img"
              tabIndex={0}
            >
              <Info className="size-3.5" />
            </span>
          </Tooltips>
        ) : null}
      </div>
      <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
        {description}
      </p>
    </div>
  );
}

function ToggleButton({
  active,
  children,
  disabled,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <MuteButton
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      variant={active ? "dark" : "default"}
    >
      {children}
    </MuteButton>
  );
}

function RoleDescriptionMarkdownPreview({ markdown }: { markdown: string }) {
  const trimmedMarkdown = markdown.trim();

  return (
    <div className="gap-2 flex items-center justify-center">
      <div className="min-h-[240px] w-full max-w-[720px] rounded-md border border-neutral-1000-a05 bg-white px-4 py-4 text-[13px] leading-6 text-neutral-primary shadow-sm sm:px-10 sm:py-10">
        <div className="flex items-center justify-center w-full gap-1.5 pb-4">
          <div className={opsTheme.label}>Markdown Preview</div>
          <Tooltips
            side="right"
            text="이 역할을 후보자에게 추천할 때 실제로 보여지는 설명입니다."
          >
            <span
              aria-label="Markdown Preview 안내"
              className="inline-flex cursor-help text-neutral-soft hover:text-neutral-primary"
              role="img"
              tabIndex={0}
            >
              <Info className="size-3.5" />
            </span>
          </Tooltips>
        </div>
        {trimmedMarkdown ? (
          <RichText content={trimmedMarkdown} />
        ) : (
          <div className="text-[13px] text-neutral-muted">
            Description에 markdown을 입력하면 여기서 미리보기로 렌더링됩니다.
          </div>
        )}
      </div>
    </div>
  );
}

export function OrgRoleOverview() {
  const { activeRole, workspaceId } = useOrgJobsNavigation();
  const {
    bootstrap: { members },
    permissions,
  } = useOrgWorkspace();
  const addToast = useToastStore((state) => state.add);
  const updateRoleDetails = useUpdateOrgRole();
  const updateRoleStatus = useUpdateOrgRole();
  const updateNotifications = useUpdateOrgRoleNotificationSettings();
  const settingsQuery = useOrgRoleNotificationSettings({
    enabled: Boolean(activeRole),
    roleId: activeRole?.roleId ?? "",
    workspaceId,
  });
  const [roleEditingField, setRoleEditingField] =
    useState<RoleEditingField | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [roleSaveError, setRoleSaveError] = useState("");
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
  const [settingsSaveError, setSettingsSaveError] = useState("");

  const channels = useMemo(
    () =>
      settingsQuery.data?.channels.map((channel) => ({
        ...channel,
        enabled: channelOverrides[channel.channelId] ?? channel.enabled,
      })) ?? null,
    [channelOverrides, settingsQuery.data]
  );

  const canManage = permissions.canManageCandidates;
  const roleEditing = roleEditingField !== null;
  const currentRoleDraft = activeRole
    ? (roleDraft ?? toRoleDraft(activeRole))
    : null;
  const roleHasChanges =
    activeRole !== null &&
    roleDraft !== null &&
    JSON.stringify(normalizeRoleDraft(roleDraft)) !==
      JSON.stringify(normalizeRoleDraft(toRoleDraft(activeRole)));
  const initialStatus = normalizeOrgRoleStatus(activeRole?.status);
  const lifecycleStatus =
    initialStatus === "top_priority" ? "active" : initialStatus;
  const notificationChanged = Object.keys(channelOverrides).length > 0;
  const assigneeUserIds =
    assigneeOverride ?? settingsQuery.data?.assigneeUserIds ?? [];
  const assigneeChanged =
    assigneeOverride !== null &&
    JSON.stringify([...assigneeOverride].sort()) !==
      JSON.stringify([...(settingsQuery.data?.assigneeUserIds ?? [])].sort());
  const settingsHaveChanges = notificationChanged || assigneeChanged;
  const settingsPending = updateNotifications.isPending;
  const hasUnsavedChanges = roleHasChanges || settingsHaveChanges;
  useUnsavedChangesWarning(hasUnsavedChanges);

  if (!activeRole || !currentRoleDraft) return null;

  const assignedMembers = assigneeUserIds.flatMap((userId) => {
    const member = members.find((item) => item.userId === userId);
    return member ? [member] : [];
  });
  const assignableMembers = members.filter(
    (member) => member.email && !assigneeUserIds.includes(member.userId)
  );

  const changeAssignees = (nextUserIds: string[]) => {
    if (!canManage || settingsPending) return;
    setAssigneeOverride(Array.from(new Set(nextUserIds)));
    setSettingsEditing(true);
    setSettingsSaveError("");
  };

  const changeRoleDraft = (
    patch: Partial<RoleDraft>,
    field: RoleEditingField
  ) => {
    if (!canManage || updateRoleDetails.isPending) return;
    setRoleEditingField(field);
    setRoleSaveError("");
    setRoleDraft((current) => ({
      ...(current ?? toRoleDraft(activeRole)),
      ...patch,
    }));
  };

  const startRoleEditing = (field: RoleEditingField) => {
    if (!canManage || updateRoleDetails.isPending) return;
    setRoleDraft((current) => current ?? toRoleDraft(activeRole));
    setRoleSaveError("");
    setRoleEditingField(field);
  };

  const cancelRoleEditing = () => {
    if (updateRoleDetails.isPending) return;
    setRoleDraft(null);
    setRoleSaveError("");
    setRoleEditingField(null);
  };

  const saveRole = async () => {
    if (!roleDraft || !roleHasChanges || updateRoleDetails.isPending) return;
    const name = roleDraft.name.trim();
    if (!name) {
      setRoleSaveError("Role title을 입력해 주세요.");
      return;
    }

    setRoleSaveError("");
    try {
      await updateRoleDetails.mutateAsync({
        description: roleDraft.description.trim() || null,
        employmentTypes: roleDraft.employmentTypes,
        externalJdUrl: roleDraft.externalJdUrl.trim() || null,
        locationText: roleDraft.locationText.trim() || null,
        name,
        request: roleDraft.request.trim() || null,
        roleId: activeRole.roleId,
        salaryRange: roleDraft.salaryRange.trim() || null,
        workMode: roleDraft.workMode || null,
        workspaceId,
      });
      setRoleDraft(null);
      setRoleEditingField(null);
      addToast({ message: "Role 정보를 저장했습니다.", variant: "success" });
    } catch (error) {
      setRoleSaveError(
        getErrorMessage(error, "Role 정보를 저장하지 못했습니다.")
      );
    }
  };

  const cancelSettingsEditing = () => {
    if (settingsPending) return;
    setChannelOverrides({});
    setAssigneeOverride(null);
    setSettingsSaveError("");
    setSettingsEditing(false);
  };

  const saveSettings = async () => {
    if (!channels || !settingsHaveChanges || settingsPending) return;
    setSettingsSaveError("");

    try {
      await updateNotifications.mutateAsync({
        assigneeUserIds,
        channels: channels.map(({ channelId, enabled }) => ({
          channelId,
          enabled,
        })),
        roleId: activeRole.roleId,
        workspaceId,
      });
      setChannelOverrides({});
      setAssigneeOverride(null);
      setSettingsEditing(false);
      addToast({ message: "Role 설정을 저장했습니다.", variant: "success" });
    } catch (error) {
      setSettingsSaveError(
        getErrorMessage(error, "Role 설정을 저장하지 못했습니다.")
      );
    }
  };

  const confirmStatusChange = async () => {
    if (!statusToConfirm || updateRoleStatus.isPending) return;
    try {
      await updateRoleStatus.mutateAsync({
        roleId: activeRole.roleId,
        status: statusToConfirm,
        workspaceId,
      });
      addToast({ message: "채용 상태를 변경했습니다.", variant: "success" });
      setStatusToConfirm(null);
    } catch (error) {
      addToast({
        message: getErrorMessage(error, "채용 상태를 변경하지 못했습니다."),
        variant: "error",
      });
    }
  };

  const cancelAllEditing = () => {
    cancelRoleEditing();
    cancelSettingsEditing();
  };

  const saveAll = async () => {
    if (roleHasChanges) await saveRole();
    if (settingsHaveChanges) await saveSettings();
  };

  const statusMeta =
    lifecycleStatus === "active"
      ? {
          description: "현재 후보자를 추천받고 채용을 진행하고 있습니다.",
          label: "채용 진행 중",
          tone: "positive" as const,
        }
      : lifecycleStatus === "paused"
        ? {
            description: "후보자 추천을 잠시 멈춘 상태입니다.",
            label: "채용 일시정지",
            tone: "warning" as const,
          }
        : {
            description: "채용이 종료되어 후보자를 추천받지 않습니다.",
            label: "채용 종료",
            tone: "neutral" as const,
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

  return (
    <div className="space-y-8">
      <OrgSection>
        <div className="grid gap-10 lg:grid-cols-[minmax(260px,0.72fr)_minmax(360px,1.28fr)] lg:gap-12">
          <section className="min-w-0 space-y-4">
            <SectionHeading
              description="현재 상태를 확인하고 채용 운영을 변경합니다."
              title="Status"
            />
            <div className="rounded-md bg-bg-basement px-3 py-3 text-sm">
              {statusMeta.label}
              <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
                {statusMeta.description}
              </p>
            </div>
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
          </section>
          {settingsQuery.error ? (
            <section className="space-y-3">
              <div className="rounded-md border border-critical/20 bg-critical-faded px-3 py-3 text-[13px] text-critical">
                {getErrorMessage(
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
                <SectionHeading
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
                <SectionHeading
                  description="이 역할의 후보자 연결을 함께 담당할 멤버를 선택하세요."
                  info="담당자로 설정한 멤버는 이 역할의 후보자와 연결될 때 소개 이메일 CC에 자동으로 포함됩니다."
                  title="담당자"
                />
                <div className="flex items-start gap-3 pt-1">
                  <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                    {assignedMembers.length > 0 ? (
                      assignedMembers.map((member) => (
                        <div
                          className="flex min-w-0 max-w-full items-center gap-2 rounded-full bg-black/5 pr-1 pl-3.5 py-1"
                          key={member.userId}
                        >
                          <span className="max-w-36 truncate text-[13px] font-medium text-neutral-primary">
                            {member.name || "이름 없음"}
                          </span>
                          <span className="max-w-52 truncate text-[12px] text-neutral-muted">
                            {member.email || "이메일 없음"}
                          </span>
                          {member.role && (
                            <span className="max-w-32 truncate text-[12px] text-neutral-soft">
                              {member.role}
                            </span>
                          )}
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
                      ))
                    ) : (
                      <></>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <MuteButton
                          className="shrink-0"
                          disabled={!canManage || settingsPending}
                        >
                          <Plus className="size-4" />
                          담당자 추가
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

      <OrgSection>
        <div className="rounded-md bg-primary-faded/30 p-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <div className="text-[14px] font-medium text-primary">
                Role Request & Criteria
              </div>
              <div className="mt-1 text-[13px] font-normal leading-6 text-black/60">
                이 내용은 매번 인재를 탐색하고 연결하거나 후보자를 추천할 때
                기준으로 반영됩니다. 여러가지 사항이 있다면 무엇이 더 우선순위가
                높은지 등을 자세히 알려주실 수록 좋습니다.
              </div>
            </div>
          </div>
          <InlineEditableTextarea
            ariaLabel="Role Request & Criteria 수정"
            disabled={!canManage || updateRoleDetails.isPending}
            displayClassName="min-h-[116px] py-2.5 pb-3.5 text-[13px] leading-5 text-black"
            editing={roleEditingField === "request"}
            maxRows={20}
            onChange={(event) =>
              changeRoleDraft({ request: event.target.value }, "request")
            }
            onEdit={() => startRoleEditing("request")}
            rows={5}
            textareaClassName="min-h-[116px] border-primary/50 px-3 py-2.5 pb-3.5 text-[13px] leading-5 text-black focus:border-primary focus:ring-primary/15"
            value={currentRoleDraft.request}
          />
        </div>
        {roleEditingField === "request" && roleSaveError ? (
          <div className="mt-3 text-[12px] text-critical" role="alert">
            {roleSaveError}
          </div>
        ) : null}
      </OrgSection>

      <OrgSection>
        <OrgSectionHeader title="Basics" />
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <span className={opsTheme.label}>Role title</span>
            <InlineEditableInput
              ariaLabel="Role title 수정"
              disabled={!canManage || updateRoleDetails.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              editing={roleEditingField === "name"}
              inputClassName="h-10 px-3 py-2 text-[13px]"
              onChange={(event) =>
                changeRoleDraft({ name: event.target.value }, "name")
              }
              onEdit={() => startRoleEditing("name")}
              required
              value={currentRoleDraft.name}
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
              disabled={!canManage || updateRoleDetails.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              editing={roleEditingField === "salaryRange"}
              inputClassName="h-10 px-3 py-2 text-[13px]"
              onChange={(event) =>
                changeRoleDraft(
                  { salaryRange: event.target.value },
                  "salaryRange"
                )
              }
              onEdit={() => startRoleEditing("salaryRange")}
              placeholder="예: 연봉 7,000만–9,000만원 + 스톡옵션"
              value={currentRoleDraft.salaryRange}
            />
          </div>
          <div className="grid gap-2">
            <div className={opsTheme.label}>고용 형태</div>
            <InlineEditableValue
              ariaLabel="고용 형태 수정"
              disabled={!canManage || updateRoleDetails.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              displayValue={
                currentRoleDraft.employmentTypes.length
                  ? currentRoleDraft.employmentTypes
                      .map((type) => EMPLOYMENT_TYPE_LABEL[type] ?? type)
                      .join(", ")
                  : "-"
              }
              editing={roleEditingField === "employmentTypes"}
              editor={
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(EMPLOYMENT_TYPE_LABEL).map(
                    ([type, label]) => (
                      <ToggleButton
                        active={currentRoleDraft.employmentTypes.includes(type)}
                        disabled={!canManage || updateRoleDetails.isPending}
                        key={type}
                        onClick={() =>
                          changeRoleDraft(
                            {
                              employmentTypes:
                                currentRoleDraft.employmentTypes.includes(type)
                                  ? currentRoleDraft.employmentTypes.filter(
                                      (item) => item !== type
                                    )
                                  : [...currentRoleDraft.employmentTypes, type],
                            },
                            "employmentTypes"
                          )
                        }
                      >
                        {label}
                      </ToggleButton>
                    )
                  )}
                </div>
              }
              onEdit={() => startRoleEditing("employmentTypes")}
            />
          </div>
          <div className="grid gap-2">
            <div className={opsTheme.label}>근무 방식</div>
            <InlineEditableSelect
              ariaLabel="근무 방식 수정"
              disabled={!canManage || updateRoleDetails.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              editing={roleEditingField === "workMode"}
              onEdit={() => startRoleEditing("workMode")}
              onValueChange={(workMode) =>
                changeRoleDraft({ workMode }, "workMode")
              }
              options={Object.entries(WORK_MODE_LABEL).map(
                ([value, label]) => ({ label, value })
              )}
              placeholder="근무 방식"
              triggerClassName="w-full text-[13px]"
              value={currentRoleDraft.workMode}
            />
          </div>
          <div className="grid gap-2">
            <span className={opsTheme.label}>외부 JD 링크</span>
            <InlineEditableInput
              ariaLabel="외부 JD 링크 수정"
              disabled={!canManage || updateRoleDetails.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              editing={roleEditingField === "externalJdUrl"}
              inputClassName="h-10 px-3 py-2 text-[13px]"
              onChange={(event) =>
                changeRoleDraft(
                  { externalJdUrl: event.target.value },
                  "externalJdUrl"
                )
              }
              onEdit={() => startRoleEditing("externalJdUrl")}
              placeholder="Optional"
              type="url"
              value={currentRoleDraft.externalJdUrl}
            />
          </div>
          <div className="grid gap-2">
            <span className={opsTheme.label}>근무 지역</span>
            <InlineEditableInput
              ariaLabel="근무 지역 수정"
              disabled={!canManage || updateRoleDetails.isPending}
              displayClassName="text-[13px] leading-5 text-neutral-primary"
              editing={roleEditingField === "locationText"}
              inputClassName="h-10 px-3 py-2 text-[13px]"
              onChange={(event) =>
                changeRoleDraft(
                  { locationText: event.target.value },
                  "locationText"
                )
              }
              onEdit={() => startRoleEditing("locationText")}
              value={currentRoleDraft.locationText}
            />
          </div>
        </div>
        {roleEditingField &&
        roleEditingField !== "request" &&
        roleEditingField !== "description" &&
        roleSaveError ? (
          <div className="mt-3 text-[12px] text-critical" role="alert">
            {roleSaveError}
          </div>
        ) : null}
      </OrgSection>

      <OrgSection>
        <OrgSectionHeader
          description="후보자에게 보여지는 역할 설명입니다."
          title="Description"
        />
        <div className="grid gap-5">
          <InlineEditableTextarea
            ariaLabel="Description 수정"
            disabled={!canManage || updateRoleDetails.isPending}
            displayClassName="min-h-[164px] py-2.5 pb-3.5 text-[13px] leading-5 text-neutral-primary"
            editing={roleEditingField === "description"}
            onChange={(event) =>
              changeRoleDraft(
                { description: event.target.value },
                "description"
              )
            }
            onEdit={() => startRoleEditing("description")}
            rows={7}
            textareaClassName="min-h-[164px] px-3 py-2.5 pb-3.5 text-[13px] leading-5"
            value={currentRoleDraft.description}
          />
          <RoleDescriptionMarkdownPreview
            markdown={currentRoleDraft.description}
          />
        </div>
        {roleEditingField === "description" && roleSaveError ? (
          <div className="mt-3 text-[12px] text-critical" role="alert">
            {roleSaveError}
          </div>
        ) : null}
      </OrgSection>

      {canManage && (roleEditing || settingsEditing) ? (
        <OrgUnsavedChangesBar
          canSave={hasUnsavedChanges}
          hasChanges={hasUnsavedChanges}
          onCancel={cancelAllEditing}
          onSave={() => void saveAll()}
          pending={updateRoleDetails.isPending || settingsPending}
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
    </div>
  );
}
