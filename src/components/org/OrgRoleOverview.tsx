import Link from "next/link";
import { ArrowRight, LoaderCircle, SlackIcon } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { opsTheme } from "@/components/ops/theme";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import { useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import {
  useOrgRoleNotificationSettings,
  useUpdateOrgRoleNotificationSettings,
} from "@/hooks/org/useOrgRoleNotifications";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { buildOrgHref } from "@/lib/org/routes";
import {
  normalizeOrgRoleStatus,
  type OrgRoleStatus,
} from "@/lib/org/roleStatus";
import type { OrgRole } from "@/lib/org/server";
import { cn } from "@/lib/utils";
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

const ROLE_STATUS_OPTIONS: Array<{ label: string; value: OrgRoleStatus }> = [
  { label: "진행", value: "active" },
  { label: "중단", value: "paused" },
  { label: "종료", value: "ended" },
];

type RoleDraft = {
  description: string;
  employmentTypes: string[];
  externalJdUrl: string;
  locationText: string;
  name: string;
  request: string;
  workMode: string;
};

type RoleEditingSection = "basics" | "description" | "request";

const fieldClassName = "flex flex-col gap-2";

function toRoleDraft(role: OrgRole): RoleDraft {
  return {
    description: role.description ?? "",
    employmentTypes: [...role.employmentTypes],
    externalJdUrl: role.externalJdUrl ?? "",
    locationText: role.locationText ?? "",
    name: role.name,
    request: role.request ?? "",
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
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div>
      <h3 className="text-[14px] font-medium text-neutral-primary">{title}</h3>
      <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
        {description}
      </p>
    </div>
  );
}

function AutoResizeTextarea({
  className,
  maxRows,
  value,
  ...props
}: ComponentProps<typeof Textarea> & { maxRows?: number }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    if (!maxRows) {
      textarea.style.height = `${textarea.scrollHeight}px`;
      return;
    }

    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
    const paddingHeight =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom);
    const borderHeight =
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);
    const maxHeight = lineHeight * maxRows + paddingHeight + borderHeight;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxRows, value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      className={cn(
        "resize-none overflow-hidden px-3 py-2.5 pb-3.5 text-[13px] leading-5",
        className
      )}
      {...props}
    />
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
    <div className="grid gap-2">
      <div className={opsTheme.label}>Markdown Preview</div>
      <div
        className={cn(
          opsTheme.panelSoft,
          "min-h-[112px] px-4 py-3.5 text-[13px] leading-6 text-neutral-primary"
        )}
      >
        {trimmedMarkdown ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={{
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={opsTheme.link}
                >
                  {children}
                </a>
              ),
              h1: ({ children }) => (
                <h1 className="mt-4 text-[16px] font-medium text-neutral-primary first:mt-0">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="mt-4 text-[15px] font-medium text-neutral-primary first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-3 text-[13px] font-medium text-neutral-primary first:mt-0">
                  {children}
                </h3>
              ),
              hr: () => (
                <hr className="my-4 border-0 border-t border-neutral-1000-a10" />
              ),
              li: ({ children }) => <li className="pl-1">{children}</li>,
              ol: ({ children }) => (
                <ol className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">
                  {children}
                </ol>
              ),
              p: ({ children }) => (
                <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-neutral-muted first:mt-0">
                  {children}
                </p>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-neutral-primary">
                  {children}
                </strong>
              ),
              ul: ({ children }) => (
                <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">
                  {children}
                </ul>
              ),
            }}
          >
            {trimmedMarkdown}
          </ReactMarkdown>
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
  const { permissions } = useOrgWorkspace();
  const addToast = useToastStore((state) => state.add);
  const updateRoleDetails = useUpdateOrgRole();
  const updateRoleSettings = useUpdateOrgRole();
  const updateNotifications = useUpdateOrgRoleNotificationSettings();
  const settingsQuery = useOrgRoleNotificationSettings({
    enabled: Boolean(activeRole),
    roleId: activeRole?.roleId ?? "",
    workspaceId,
  });
  const [roleEditingSection, setRoleEditingSection] =
    useState<RoleEditingSection | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [roleSaveError, setRoleSaveError] = useState("");
  const [settingsEditing, setSettingsEditing] = useState(false);
  const [channelOverrides, setChannelOverrides] = useState<
    Record<string, boolean>
  >({});
  const [statusOverride, setStatusOverride] = useState<OrgRoleStatus | null>(
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

  if (!activeRole) return null;

  const canManage = permissions.canManageCandidates;
  const roleEditing = roleEditingSection !== null;
  const currentRoleDraft = roleDraft ?? toRoleDraft(activeRole);
  const roleHasChanges =
    roleDraft !== null &&
    JSON.stringify(normalizeRoleDraft(roleDraft)) !==
      JSON.stringify(normalizeRoleDraft(toRoleDraft(activeRole)));
  const initialStatus = normalizeOrgRoleStatus(activeRole.status);
  const selectedStatus = statusOverride ?? initialStatus;
  const notificationChanged = Object.keys(channelOverrides).length > 0;
  const statusChanged = selectedStatus !== initialStatus;
  const settingsHaveChanges = notificationChanged || statusChanged;
  const settingsPending =
    updateNotifications.isPending || updateRoleSettings.isPending;

  const changeRoleDraft = (
    patch: Partial<RoleDraft>,
    section: RoleEditingSection
  ) => {
    if (!canManage || updateRoleDetails.isPending) return;
    setRoleEditingSection(section);
    setRoleSaveError("");
    setRoleDraft((current) => ({
      ...(current ?? toRoleDraft(activeRole)),
      ...patch,
    }));
  };

  const startRoleEditing = (section: RoleEditingSection) => {
    if (!canManage || updateRoleDetails.isPending) return;
    setRoleDraft((current) => current ?? toRoleDraft(activeRole));
    setRoleSaveError("");
    setRoleEditingSection(section);
  };

  const cancelRoleEditing = () => {
    if (updateRoleDetails.isPending) return;
    setRoleDraft(null);
    setRoleSaveError("");
    setRoleEditingSection(null);
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
        workMode: roleDraft.workMode || null,
        workspaceId,
      });
      setRoleDraft(null);
      setRoleEditingSection(null);
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
    setStatusOverride(null);
    setSettingsSaveError("");
    setSettingsEditing(false);
  };

  const selectStatus = (nextStatus: OrgRoleStatus) => {
    if (!canManage || settingsPending || nextStatus === selectedStatus) return;
    setSettingsEditing(true);
    setSettingsSaveError("");
    setStatusOverride(nextStatus === initialStatus ? null : nextStatus);
  };

  const saveSettings = async () => {
    if (!channels || !settingsHaveChanges || settingsPending) return;
    setSettingsSaveError("");

    try {
      await Promise.all([
        notificationChanged
          ? updateNotifications.mutateAsync({
              channels: channels.map(({ channelId, enabled }) => ({
                channelId,
                enabled,
              })),
              roleId: activeRole.roleId,
              workspaceId,
            })
          : Promise.resolve(),
        statusChanged
          ? updateRoleSettings.mutateAsync({
              roleId: activeRole.roleId,
              status: selectedStatus,
              workspaceId,
            })
          : Promise.resolve(),
      ]);
      setChannelOverrides({});
      setStatusOverride(null);
      setSettingsEditing(false);
      addToast({ message: "Role 설정을 저장했습니다.", variant: "success" });
    } catch (error) {
      setSettingsSaveError(
        getErrorMessage(error, "Role 설정을 저장하지 못했습니다.")
      );
    }
  };

  const roleActions =
    canManage && roleEditing ? (
      <div className="flex items-center gap-1.5">
        <MuteButton
          disabled={updateRoleDetails.isPending}
          onClick={cancelRoleEditing}
        >
          취소
        </MuteButton>
        <MuteButton
          disabled={!roleHasChanges || updateRoleDetails.isPending}
          onClick={() => void saveRole()}
          variant="primary"
        >
          {updateRoleDetails.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : null}
          저장
        </MuteButton>
      </div>
    ) : null;

  const settingsActions =
    canManage && settingsEditing ? (
      <div className="flex items-center gap-1.5">
        <MuteButton disabled={settingsPending} onClick={cancelSettingsEditing}>
          취소
        </MuteButton>
        <MuteButton
          disabled={!channels || !settingsHaveChanges || settingsPending}
          onClick={() => void saveSettings()}
          variant="primary"
        >
          {settingsPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : null}
          저장
        </MuteButton>
      </div>
    ) : null;

  return (
    <div className="space-y-8">
      <OrgSection>
        {settingsQuery.error ? (
          <div className="space-y-3">
            <div className="rounded-md border border-critical/20 bg-critical-faded px-3 py-3 text-[13px] text-critical">
              {getErrorMessage(
                settingsQuery.error,
                "Role 설정을 불러오지 못했습니다."
              )}
            </div>
            <MuteButton onClick={() => void settingsQuery.refetch()}>
              다시 시도
            </MuteButton>
          </div>
        ) : settingsQuery.isLoading || !channels ? (
          <div className="flex h-48 items-center justify-center text-neutral-muted">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-8 lg:flex-row lg:flex-wrap lg:items-start lg:gap-x-12 lg:gap-y-4">
            <section className="min-w-0 space-y-3 lg:w-[34%] lg:shrink-0">
              <SectionHeading
                description="현재 포지션의 채용 상태를 변경합니다."
                title="Status"
              />
              <div className="flex flex-wrap gap-2">
                {ROLE_STATUS_OPTIONS.map((option) => {
                  const selected = selectedStatus === option.value;
                  return (
                    <MuteButton
                      aria-pressed={selected}
                      className={cn(
                        selected &&
                          "border-positive/30 bg-positive-faded text-positive hover:bg-positive-faded"
                      )}
                      disabled={!canManage || settingsPending}
                      key={option.value}
                      onClick={() => selectStatus(option.value)}
                      variant={selected ? "neutral" : "default"}
                    >
                      {option.label}
                    </MuteButton>
                  );
                })}
              </div>
            </section>
            <section className="min-w-0 flex-1 space-y-2">
              <SectionHeading
                description="이 포지션의 새로운 연결 소식을 받을 Slack 채널을 선택하세요."
                title="알림 채널"
              />
              {channels.length > 0 ? (
                <div className="divide-y divide-neutral-1000-a05 bg-bg-default">
                  {channels.map((channel) => (
                    <div
                      className="flex items-center gap-3 py-3.5"
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
            </section>

            {settingsSaveError ? (
              <div
                className="w-full rounded-md border border-critical/20 bg-critical-faded px-3 py-3 text-[12px] text-critical"
                role="alert"
              >
                {settingsSaveError}
              </div>
            ) : null}
          </div>
        )}
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
            {roleEditingSection === "request" ? roleActions : null}
          </div>
          <label className={fieldClassName}>
            <span className="sr-only">Role Request & Criteria</span>
            <AutoResizeTextarea
              className={cn(
                "border-primary/50 text-black focus:cursor-text focus:border-primary focus:ring-primary/15",
                canManage && !roleEditing
                  ? "cursor-pointer bg-bg-default hover:border-primary"
                  : !canManage && "cursor-default bg-bg-default"
              )}
              maxRows={20}
              onChange={(event) =>
                changeRoleDraft({ request: event.target.value }, "request")
              }
              onFocus={() => startRoleEditing("request")}
              readOnly={!canManage || updateRoleDetails.isPending}
              rows={5}
              value={currentRoleDraft.request}
            />
          </label>
        </div>
        {roleEditingSection === "request" && roleSaveError ? (
          <div className="mt-3 text-[12px] text-critical" role="alert">
            {roleSaveError}
          </div>
        ) : null}
      </OrgSection>

      <OrgSection>
        <OrgSectionHeader
          actions={roleEditingSection === "basics" ? roleActions : null}
          title="Basics"
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={cn(fieldClassName, "sm:col-span-2")}>
            <span className={opsTheme.label}>Role title</span>
            <Input
              className={cn(
                "h-10 px-3 py-2 text-[13px] focus:cursor-text",
                canManage && !roleEditing
                  ? "cursor-pointer bg-bg-default hover:border-primary"
                  : !canManage && "cursor-default bg-bg-default"
              )}
              onChange={(event) =>
                changeRoleDraft({ name: event.target.value }, "basics")
              }
              onFocus={() => startRoleEditing("basics")}
              readOnly={!canManage || updateRoleDetails.isPending}
              required
              value={currentRoleDraft.name}
            />
          </label>
          <div className="grid gap-2">
            <div className={opsTheme.label}>고용 형태</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([type, label]) => (
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
                      "basics"
                    )
                  }
                >
                  {label}
                </ToggleButton>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <div className={opsTheme.label}>근무 방식</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(WORK_MODE_LABEL).map(([workMode, label]) => (
                <ToggleButton
                  active={currentRoleDraft.workMode === workMode}
                  disabled={!canManage || updateRoleDetails.isPending}
                  key={workMode}
                  onClick={() => changeRoleDraft({ workMode }, "basics")}
                >
                  {label}
                </ToggleButton>
              ))}
            </div>
          </div>
          <label className={fieldClassName}>
            <span className={opsTheme.label}>외부 JD 링크</span>
            <Input
              className={cn(
                "h-10 px-3 py-2 text-[13px] focus:cursor-text",
                canManage && !roleEditing
                  ? "cursor-pointer bg-bg-default hover:border-primary"
                  : !canManage && "cursor-default bg-bg-default"
              )}
              onChange={(event) =>
                changeRoleDraft({ externalJdUrl: event.target.value }, "basics")
              }
              onFocus={() => startRoleEditing("basics")}
              placeholder="Optional"
              readOnly={!canManage || updateRoleDetails.isPending}
              value={currentRoleDraft.externalJdUrl}
            />
          </label>
          <label className={fieldClassName}>
            <span className={opsTheme.label}>근무 지역</span>
            <Input
              className={cn(
                "h-10 px-3 py-2 text-[13px] focus:cursor-text",
                canManage && !roleEditing
                  ? "cursor-pointer bg-bg-default hover:border-primary"
                  : !canManage && "cursor-default bg-bg-default"
              )}
              onChange={(event) =>
                changeRoleDraft({ locationText: event.target.value }, "basics")
              }
              onFocus={() => startRoleEditing("basics")}
              readOnly={!canManage || updateRoleDetails.isPending}
              value={currentRoleDraft.locationText}
            />
          </label>
        </div>
        {roleEditingSection === "basics" && roleSaveError ? (
          <div className="mt-3 text-[12px] text-critical" role="alert">
            {roleSaveError}
          </div>
        ) : null}
      </OrgSection>

      <OrgSection>
        <OrgSectionHeader
          actions={roleEditingSection === "description" ? roleActions : null}
          description="후보자에게 보여지는 역할 설명입니다."
          title="Description"
        />
        <div className="grid gap-5">
          <label className={fieldClassName}>
            <AutoResizeTextarea
              className={cn(
                "focus:cursor-text",
                canManage && !roleEditing
                  ? "cursor-pointer bg-bg-default hover:border-primary"
                  : !canManage && "cursor-default bg-bg-default"
              )}
              onChange={(event) =>
                changeRoleDraft(
                  { description: event.target.value },
                  "description"
                )
              }
              onFocus={() => startRoleEditing("description")}
              readOnly={!canManage || updateRoleDetails.isPending}
              rows={7}
              value={currentRoleDraft.description}
            />
          </label>
          <RoleDescriptionMarkdownPreview
            markdown={currentRoleDraft.description}
          />
        </div>
        {roleEditingSection === "description" && roleSaveError ? (
          <div className="mt-3 text-[12px] text-critical" role="alert">
            {roleSaveError}
          </div>
        ) : null}
      </OrgSection>
    </div>
  );
}
