import { SlackLogo as SlackIcon } from "@/components/common/BrandLogos";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useOrgLocale, type OrgCopy } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  Ellipsis,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { OrgInterviewAvailabilityDialog } from "@/components/org/meetings/OrgInterviewAvailabilityDialog";
import { OrgSlackChannelPicker } from "@/components/org/OrgSlackChannelPicker";
import { OrgSlackChannelRolesDialog } from "@/components/org/OrgSlackChannelRolesDialog";
import { OrgSlackCreateChannelDialog } from "@/components/org/OrgSlackCreateChannelDialog";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgGoogleCalendarIntegration } from "@/components/org/workspace/OrgGoogleCalendarIntegration";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { Badge } from "@/components/ui/badge";
import { CardButton, MuteButton } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  type OrgSlackChannel,
  useAddOrgSlackChannel,
  useConnectOrgSlack,
  useDisconnectOrgSlack,
  useOrgSlackStatus,
  useRemoveOrgSlackChannel,
} from "@/hooks/org/useOrgSlack";
import { useOrgMeetingAvailability } from "@/hooks/org/useOrgMeetingAvailability";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { ISO_WEEKDAYS } from "@/lib/meetings/availability";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/useToastStore";

function formatChannel(
  c: OrgCopy,
  value: string | null | undefined,
  channelId?: string | null
) {
  const channel = String(value ?? "").trim();
  if (!channel)
    return channelId
      ? c("채널 {p0}", "Channel {p0}", {
          p0: channelId,
        })
      : c("선택한 채널", "Selected channel");
  return channel.startsWith("#") ? channel : `#${channel}`;
}

export function OrgSettingsPage() {
  const { locale, c } = useOrgLocale();
  const weekdayShortLabels = [
    c("월", "Mon"),
    c("화", "Tue"),
    c("수", "Wed"),
    c("목", "Thu"),
    c("금", "Fri"),
    c("토", "Sat"),
    c("일", "Sun"),
  ];
  const { permissions, user, workspace } = useOrgWorkspace();
  const router = useRouter();
  const isCalendarCallback =
    router.isReady && router.query.googleCalendar === "callback";
  const availabilityDialogOpen =
    router.isReady && router.query.dialog === "interview-availability";
  const activeIntegration =
    isCalendarCallback ||
    availabilityDialogOpen ||
    (router.isReady && router.query.tab === "calendar")
      ? "calendar"
      : "slack";
  const addToast = useToastStore((state) => state.add);
  const handledSlackResult = useRef("");
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [createChannelInitialName, setCreateChannelInitialName] = useState("");
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [removeChannelId, setRemoveChannelId] = useState<string | null>(null);
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [roleChannel, setRoleChannel] = useState<
    | (Pick<OrgSlackChannel, "channelId" | "channelName"> & { isNew?: boolean })
    | null
  >(null);
  const statusQuery = useOrgSlackStatus({
    enabled: activeIntegration === "slack",
    workspaceId: workspace.workspaceId,
  });
  const connectSlack = useConnectOrgSlack();
  const addSlackChannel = useAddOrgSlackChannel(workspace.workspaceId);
  const disconnectSlack = useDisconnectOrgSlack(workspace.workspaceId);
  const removeSlackChannel = useRemoveOrgSlackChannel(workspace.workspaceId);
  const status = statusQuery.data;
  const refetchSlackStatus = statusQuery.refetch;
  const availabilityQuery = useOrgMeetingAvailability({
    enabled: activeIntegration === "calendar",
    workspaceId: workspace.workspaceId,
  });
  const availability = availabilityQuery.data?.availability ?? null;
  const channelToRemove = status?.channels.find(
    (channel) => channel.channelId === removeChannelId
  );

  useEffect(() => {
    if (!router.isReady) return;
    const result =
      typeof router.query.slack === "string" ? router.query.slack : "";
    const message =
      typeof router.query.slackMessage === "string"
        ? router.query.slackMessage
        : "";
    const key = `${result}:${message}`;
    if (!result || handledSlackResult.current === key) return;
    handledSlackResult.current = key;
    if (result === "connected" && permissions.canManageIntegrations) {
      // OAuth navigation is an external event: consume it once and open setup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAddChannelOpen(true);
      void refetchSlackStatus();
    }
    addToast({
      message:
        result === "connected"
          ? c("Slack을 연결했어요.", "Slack connected.")
          : message ||
            c(
              "Slack 연결을 완료하지 못했습니다.",
              "Failed to complete Slack connection."
            ),
      variant: result === "connected" ? "success" : "error",
    });
    const nextQuery = { ...router.query };
    delete nextQuery.slack;
    delete nextQuery.slackMessage;
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true }
    );
  }, [
    addToast,
    router,
    router.isReady,
    router.query,
    c,
    permissions.canManageIntegrations,
    refetchSlackStatus,
  ]);

  const connect = async () => {
    try {
      const payload = await connectSlack.mutateAsync({
        returnTo: router.asPath,
        workspaceId: workspace.workspaceId,
      });
      window.location.assign(payload.authorizeUrl);
    } catch (error) {
      addToast({
        message: localizedOrgErrorMessage(
          error,
          locale,
          c(
            "Slack 연결을 시작하지 못했습니다.",
            "Failed to start Slack connection."
          )
        ),
        variant: "error",
      });
    }
  };

  const addChannel = async (channelId: string) => {
    if (addSlackChannel.isPending) return;
    try {
      await addSlackChannel.mutateAsync({
        channelId,
      });
      const channel = status?.availableChannels.find(
        (item) => item.channelId === channelId
      );
      setAddChannelOpen(false);
      setRoleChannel({
        channelId,
        channelName: channel?.channelName ?? null,
        isNew: true,
      });
      addToast({
        message: c(
          "{p0}을 Harper 채널로 추가했습니다.",
          "Connected {p0} to Harper.",
          {
            p0: formatChannel(c, channel?.channelName, channelId),
          }
        ),
        variant: "success",
      });
    } catch {
      // Keep the channel picker open; its inline error preserves the user's context.
    }
  };

  const removeChannel = async () => {
    if (!removeChannelId) return;
    try {
      await removeSlackChannel.mutateAsync(removeChannelId);
      setRemoveChannelId(null);
      addToast({
        message: c("{p0} 연결을 제거했습니다.", "Disconnected {p0}.", {
          p0: formatChannel(c, channelToRemove?.channelName, removeChannelId),
        }),
      });
    } catch (error) {
      addToast({
        message: localizedOrgErrorMessage(
          error,
          locale,
          c(
            "Slack 채널을 제거하지 못했습니다.",
            "Failed to remove Slack channel."
          )
        ),
        variant: "error",
      });
    }
  };

  const disconnect = async () => {
    try {
      await disconnectSlack.mutateAsync();
      setDisconnectOpen(false);
      addToast({
        message: c("Slack 연결을 해제했습니다.", "Slack disconnected."),
      });
    } catch (error) {
      addToast({
        message: localizedOrgErrorMessage(
          error,
          locale,
          c("Slack 연결을 해제하지 못했습니다.", "Failed to disconnect Slack.")
        ),
        variant: "error",
      });
    }
  };

  const mutationError =
    connectSlack.error ??
    addSlackChannel.error ??
    removeSlackChannel.error ??
    disconnectSlack.error;

  const openAvailability = () => {
    const query = {
      ...router.query,
      dialog: "interview-availability",
      tab: "calendar",
    };
    void router.push({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  };

  const selectIntegration = (integration: "slack" | "calendar") => {
    if (integration === activeIntegration) return;
    const query = { ...router.query };
    if (integration === "calendar") {
      query.tab = "calendar";
    } else {
      delete query.tab;
      delete query.dialog;
    }
    void router.push({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  };

  const closeAvailability = () => {
    const query = { ...router.query };
    delete query.dialog;
    void router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <OrgPageHeader
        description={c(
          "팀이 중요한 채용 변화를 놓치지 않도록 연동과 알림을 설정하세요.",
          "Manage tools and notifications for your hiring team."
        )}
        title={c("Integrations", "Integrations")}
      />

      <div
        aria-label={c("연동 선택", "Select integration")}
        className="w-full flex flex-row gap-2 mb-8"
        role="group"
      >
        <SettingCardButton
          activeIntegration={activeIntegration}
          selectIntegration={selectIntegration}
          title={c("Slack", "Slack")}
          description={c(
            "팀과 함께 추천 소식과 채용 결정을 확인하세요.",
            "Review recommendations and hiring decisions with your team."
          )}
          icon={
            <Image
              alt={c("", "")}
              height={24}
              src="/images/logos/slack.svg"
              width={24}
            />
          }
          currentIntegration="slack"
        />
        <SettingCardButton
          activeIntegration={activeIntegration}
          selectIntegration={selectIntegration}
          title={c("Calendar", "Calendar")}
          description={c(
            "미팅이 가능한 일정을 관리하세요.",
            "Manage meeting availability"
          )}
          icon={
            <Image
              alt={c("", "")}
              height={32}
              src="/images/logos/calendar.png"
              width={32}
            />
          }
          currentIntegration="calendar"
        />
      </div>

      <OrgSection
        className={activeIntegration === "slack" ? undefined : "hidden"}
      >
        <OrgSectionHeader
          description={c(
            "후보자 추천과 검토, 역할 기준 변경, 후보자 프로세스 종료를 Slack 채널에서 팀원과 함께 진행하세요.",
            "Review candidate recommendations, update role criteria, and manage hiring decisions with your team in Slack."
          )}
          title={
            <span className="inline-flex flex-col items-start gap-3">
              <div className="border border-neutral-1000-a05 rounded-xl p-2">
                <Image
                  alt={c("", "")}
                  height={36}
                  src="/images/logos/slack.svg"
                  width={36}
                />
              </div>
              <div className="text-xl font-medium text-neutral-primary">
                {c("Slack", "Slack")}
              </div>
            </span>
          }
        />
        <div>
          {statusQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : statusQuery.error ? (
            <OrgErrorState
              message={localizedOrgErrorMessage(
                statusQuery.error,
                locale,
                c(
                  "Slack 상태를 불러오지 못했습니다.",
                  "Failed to load Slack status."
                )
              )}
              onRetry={() => void statusQuery.refetch()}
            />
          ) : status?.connected ? (
            <div className="space-y-6">
              <div className="relative w-full flex items-center justify-center overflow-hidden rounded-3xl p-7">
                <Image
                  alt={c("", "")}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 size-full object-cover"
                  fill
                  loading="eager"
                  sizes="(min-width: 1216px) 912px, (min-width: 768px) calc(100vw - 304px), calc(100vw - 32px)"
                  src="/images/bluesky.jpg"
                />
                <div className="relative flex flex-col gap-4 rounded-2xl bg-white/70 backdrop-blur-sm px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:w-[60%]">
                  <div>
                    <div className="text-[15px] font-normal text-neutral-primary">
                      {status.teamName || "Harper"}
                    </div>
                    <div className="mt-0.5 text-[13px] font-light text-neutral-muted">
                      {c("연결된 채널{count}개", "{count} connected channels", {
                        count: status.channels.length,
                      })}
                    </div>
                  </div>
                  {permissions.canManageIntegrations ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <MuteButton
                          aria-label={c(
                            "Slack 연결 관리",
                            "Manage Slack connection"
                          )}
                          className="self-start sm:self-auto gap-6"
                          size="md"
                          variant="default"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="size-2 rounded-full bg-positive"
                            />
                            {c("연결됨", "Connected")}
                          </div>
                          <ChevronDown className="w-4 h-4" />
                        </MuteButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          disabled={disconnectSlack.isPending}
                          onSelect={() => setDisconnectOpen(true)}
                          tone="danger"
                        >
                          {c("연결 끊기", "Disconnect")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="inline-flex items-center gap-2 self-start text-[13px] font-medium text-neutral-primary sm:self-auto">
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full bg-positive"
                      />
                      {c("연결됨", "Connected")}
                    </span>
                  )}
                </div>
              </div>

              {permissions.canManageIntegrations &&
              !status.canCreateChannels ? (
                <div className="flex flex-col gap-3 rounded-md bg-info-faded px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[13px] font-medium text-neutral-primary">
                      {c(
                        "Slack 채널 생성 권한이 필요해요",
                        "Permission required to create Slack channels"
                      )}
                    </div>
                    <p className="mt-1 text-[12px] font-light leading-5 text-neutral-muted">
                      {c(
                        "Slack을 다시 연결해 공개·비공개 채널 생성 권한을 승인해 주세요. 기존 채널 연결은 유지돼요.",
                        "Reconnect Slack and approve permission to create public and private channels. Existing channel connections will remain."
                      )}
                    </p>
                  </div>
                  <MuteButton
                    className="shrink-0 self-start sm:self-auto"
                    disabled={connectSlack.isPending}
                    onClick={() => void connect()}
                    size="md"
                  >
                    {connectSlack.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                    {c("Slack 다시 연결", "Reconnect Slack")}
                  </MuteButton>
                </div>
              ) : null}

              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-[14px] font-medium text-neutral-primary">
                    {c("연결된 채널", "Connected channels")}
                  </h3>
                  {permissions.canManageIntegrations ? (
                    <MuteButton
                      size="sm"
                      disabled={addSlackChannel.isPending || createChannelOpen}
                      onClick={() => {
                        addSlackChannel.reset();
                        setAddChannelOpen(true);
                      }}
                    >
                      <Plus className="size-3.5" />
                      {c("채널 추가", "Add channel")}
                    </MuteButton>
                  ) : null}
                </div>
                <div className="mt-4 border-t border-neutral-1000-a05">
                  {status.channels.map((channel) => (
                    <div
                      className="flex flex-col gap-3 px-3 py-3.5 sm:flex-row sm:items-center"
                      key={channel.channelId}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-1000-a05 text-neutral-muted">
                          <SlackIcon className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[14px] font-normal text-neutral-primary">
                              {formatChannel(
                                c,
                                channel.channelName,
                                channel.channelId
                              )}
                            </span>
                            <Badge
                              radius="full"
                              size="sm"
                              tone="positive"
                              variant="faded"
                            >
                              {channel.respondToMentions
                                ? c("@Harper 활성", "@Harper active")
                                : c("알림 전용", "Notifications only")}
                            </Badge>
                          </div>
                          <div className="mt-1 text-[12px] font-light text-neutral-muted">
                            {c(
                              "연결되었습니다.",
                              "Harper identifies the role from your message"
                            )}
                            {channel.replyToHarperThreads
                              ? c(
                                  " · Harper 스레드 답글 활성",
                                  " · Harper thread replies active"
                                )
                              : ""}
                            {channel.connectedAt ? (
                              <span className="ml-2 inline-block text-neutral-soft">
                                {c("연결일", "Connected on")} {" "}
                                <time dateTime={channel.connectedAt}>
                                  {new Date(channel.connectedAt).toLocaleDateString(
                                    locale === "ko" ? "ko-KR" : "en-US",
                                    {
                                      year: "numeric",
                                      month: "2-digit",
                                      day: "2-digit",
                                    }
                                  )}
                                </time>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {permissions.canManageIntegrations ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <MuteButton
                              aria-label={c("{p0} 작업", "{p0} actions", {
                                p0: formatChannel(
                                  c,
                                  channel.channelName,
                                  channel.channelId
                                ),
                              })}
                              size="sm"
                              variant="transparent"
                            >
                              <Ellipsis className="size-4" />
                            </MuteButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onSelect={() => setRoleChannel(channel)}
                            >
                              {c("Role 할당", "Assign roles")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={removeSlackChannel.isPending}
                              onSelect={() =>
                                setRemoveChannelId(channel.channelId)
                              }
                              tone="danger"
                            >
                              <Trash2 />
                              {c("채널 제거", "Remove channel")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-xl">
              {permissions.canManageIntegrations ? (
                <MuteButton
                  className="mt-2"
                  disabled={connectSlack.isPending}
                  onClick={() => void connect()}
                  size="lg"
                  variant="default"
                >
                  {c("Slack 연결", "Slack connection")}
                  {connectSlack.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <></>
                  )}
                </MuteButton>
              ) : (
                <p className="mt-4 text-[12px] font-light text-neutral-soft">
                  {c(
                    "Slack 연결은 Owner 또는 Admin이 설정할 수 있습니다.",
                    "Only an Owner or Admin can set up the Slack connection."
                  )}
                </p>
              )}
            </div>
          )}

          {mutationError ? (
            <div className="mt-4 rounded-md border border-critical/20 bg-critical-faded px-3 py-3 text-[12px] leading-5 text-critical">
              {mutationError instanceof Error
                ? mutationError.message
                : c(
                    "Slack 요청을 처리하지 못했습니다.",
                    "Failed to process Slack request."
                  )}
            </div>
          ) : null}
        </div>
      </OrgSection>

      {activeIntegration === "calendar" ? (
        <>
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <OrgGoogleCalendarIntegration
              className="border-b-0 pb-0"
              key={`${user.id}:${workspace.workspaceId}`}
              userId={user.id}
              workspaceId={workspace.workspaceId}
            />
            <OrgSection className="border-b-0 pb-0">
              <div
                aria-label={c(
                  "내 인터뷰 가능 시간 설정 열기",
                  "Edit my interview availability"
                )}
                className="min-h-[88px] flex flex-row items-center gap-4 text-left"
              >
                <span className="flex min-w-0 items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-faded text-primary">
                    <CalendarClock className="size-5" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-[14px] font-normal text-neutral-primary">
                      {c("인터뷰 일정", "Interview availability")}
                      {availability ? (
                        <Badge
                          radius="full"
                          size="sm"
                          tone="positive"
                          variant="faded"
                        >
                          {c("설정됨", "Configured")}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[13px] font-light leading-5 text-neutral-muted">
                      {c(
                        "후보자에게 인터뷰 일정을 요청할 때 Harper가 제안할 수 있는 내 일정을 관리하세요.",
                        "Set the times Harper can offer candidates for interviews."
                      )}
                    </span>
                  </span>
                </span>
                <MuteButton
                  type="button"
                  variant="default"
                  className="w-[80px]"
                  onClick={() => void openAvailability()}
                >
                  {c("열기", "Open")}
                  <ArrowRight className="size-3" />
                </MuteButton>
              </div>
              <div
                aria-hidden="true"
                className="flex flex-row gap-1 mt-2 ml-14"
              >
                {ISO_WEEKDAYS.map(({ key }) => {
                  const enabled = Boolean(
                    availability?.weeklyRules[key]?.length
                  );
                  return (
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-sm text-[11px]",
                        enabled
                          ? "bg-primary-faded text-primary"
                          : "bg-bg-weak text-neutral-soft"
                      )}
                      key={key}
                    >
                      {weekdayShortLabels[Number(key) - 1]}
                    </span>
                  );
                })}
              </div>
            </OrgSection>
          </div>
        </>
      ) : null}

      <OrgInterviewAvailabilityDialog
        onRequestClose={closeAvailability}
        open={availabilityDialogOpen}
        userId={user.id}
        workspaceId={workspace.workspaceId}
      />

      <TalentCareerModal
        open={addChannelOpen && permissions.canManageIntegrations}
        onClose={() => {
          if (!addSlackChannel.isPending) setAddChannelOpen(false);
        }}
        mobileBottomSheet
        closeOnBackdrop={!addSlackChannel.isPending}
        showCloseButton={!addSlackChannel.isPending}
        title={
          <div className="flex flex-row items-center gap-2">
            <SlackIcon className="size-4" />
            {c("어느 채널에서 함께할까요?", "Where should Harper join you?")}
          </div>
        }
        description={c(
          "{team}에서 Harper와 소통할 채널을 선택하세요.",
          "Choose a channel in {team} to talk with Harper.",
          {
            team: status?.teamName || workspace.companyName,
          }
        )}
        panelClassName="max-w-md"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
      >
        {statusQuery.isLoading ||
        (statusQuery.isFetching && !status?.connected) ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-muted"
          >
            <LoaderCircle className="size-4 animate-spin" />
            {c("채널을 불러오는 중이에요", "Loading channels")}
          </div>
        ) : statusQuery.error ? (
          <OrgErrorState
            message={c("채널을 불러오지 못했어요.", "Couldn't load channels.")}
            onRetry={() => void statusQuery.refetch()}
          />
        ) : (
          <OrgSlackChannelPicker
            channels={status?.availableChannels ?? []}
            disabled={addSlackChannel.isPending}
            pendingChannelId={
              addSlackChannel.isPending
                ? addSlackChannel.variables?.channelId
                : null
            }
            refreshing={statusQuery.isFetching}
            onInvite={(channelId) => void addChannel(channelId)}
            onRefresh={() => void statusQuery.refetch()}
            onCreate={
              status?.canCreateChannels
                ? () => {
                    setAddChannelOpen(false);
                    setCreateChannelInitialName("harper");
                    setCreateChannelOpen(true);
                  }
                : undefined
            }
          />
        )}
        <div className="rounded-xl px-4 py-3 text-[12px] border border-neutral-1000-a05">
          <p className="font-medium">
            {c("비공개 채널이 보이지 않나요?", "Can't find a private channel?")}
          </p>
          <p className="mt-1 text-neutral-muted">
            {c(
              "Slack의 해당 채널에서 /invite @Harper를 입력한 뒤 채널 목록을 새로고침해 주세요.",
              "In that Slack channel, enter /invite @Harper, then refresh the channel list."
            )}
          </p>
        </div>
        {addSlackChannel.isError ? (
          <p role="alert" className="text-[13px] leading-5 text-critical">
            {localizedOrgErrorMessage(
              addSlackChannel.error,
              locale,
              c("채널을 연결하지 못했어요.", "Channel connection failed.")
            )}
          </p>
        ) : null}
      </TalentCareerModal>

      {createChannelOpen ? (
        <OrgSlackCreateChannelDialog
          initialName={createChannelInitialName}
          onCreated={(channel) => setRoleChannel({ ...channel, isNew: true })}
          onOpenChange={setCreateChannelOpen}
          open
          workspaceId={workspace.workspaceId}
        />
      ) : null}

      {roleChannel && permissions.canManageIntegrations ? (
        <OrgSlackChannelRolesDialog
          key={`${workspace.workspaceId}:${roleChannel.channelId}`}
          channel={roleChannel}
          isNewChannel={roleChannel.isNew ?? false}
          onClose={() => setRoleChannel(null)}
        />
      ) : null}

      <TalentCareerModal
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        mobileBottomSheet
        title={<>{c("Slack 연결을 해제할까요?", "Disconnect Slack?")}</>}
        description={
          <>
            {c(
              "연결된 모든 채널로 더 이상 알림이 발송되지 않습니다.",
              "Organization notifications will no longer be sent to any connected channels."
            )}
          </>
        }
        panelClassName="max-w-md"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton
              disabled={disconnectSlack.isPending}
              onClick={() => setDisconnectOpen(false)}
              size="md"
            >
              {c("취소", "Cancel")}
            </MuteButton>
            <MuteButton
              disabled={disconnectSlack.isPending}
              onClick={() => void disconnect()}
              size="md"
              variant="warn"
            >
              {disconnectSlack.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {c("연결 해제", "Disconnect")}
            </MuteButton>
          </div>
        }
      >
        <></>
      </TalentCareerModal>

      <TalentCareerModal
        open={Boolean(removeChannelId)}
        onClose={() => {
          setRemoveChannelId(null);
        }}
        mobileBottomSheet
        title={<>{c("Slack 채널을 제거할까요?", "Remove Slack channel?")}</>}
        description={
          <>
            {c(
              "{channelName}로는 더 이상 알림이 발송되지 않습니다.",
              "Organization notifications will no longer be sent to {channelName}.",
              {
                channelName: formatChannel(
                  c,
                  channelToRemove?.channelName,
                  channelToRemove?.channelId
                ),
              }
            )}
          </>
        }
        panelClassName="max-w-md"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton
              disabled={removeSlackChannel.isPending}
              onClick={() => setRemoveChannelId(null)}
              size="md"
            >
              {c("취소", "Cancel")}
            </MuteButton>
            <MuteButton
              disabled={removeSlackChannel.isPending}
              onClick={() => void removeChannel()}
              size="md"
              variant="warn"
            >
              {removeSlackChannel.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {c("채널 제거", "Remove channel")}
            </MuteButton>
          </div>
        }
      >
        <></>
      </TalentCareerModal>
    </div>
  );
}

const SettingCardButton = ({
  activeIntegration,
  selectIntegration,
  title,
  description,
  icon,
  currentIntegration,
}: {
  activeIntegration: "slack" | "calendar";
  selectIntegration: (integration: "slack" | "calendar") => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  currentIntegration: "slack" | "calendar";
}) => {
  return (
    <CardButton
      aria-pressed={activeIntegration === currentIntegration}
      className={cn(
        "w-[380px] border-black/4 bg-white flex flex-row gap-3 items-center rounded-xl p-4 shadow-xs py-2 h-[80px]",
        activeIntegration === currentIntegration
          ? "hover:border-black/4 bg-neutral-100"
          : "hover:border-black/10"
      )}
      onClick={() => selectIntegration(currentIntegration)}
      selected={activeIntegration === currentIntegration}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white border border-black/5">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14px] font-medium">{title}</span>
        <span className="line-clamp-2 text-[13px] font-light leading-4 text-neutral-muted">
          {description}
        </span>
      </span>
    </CardButton>
  );
};
