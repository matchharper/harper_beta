import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  Ellipsis,
  LoaderCircle,
  Lock,
  Plus,
  SlackIcon,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { OrgInterviewAvailabilityDialog } from "@/components/org/meetings/OrgInterviewAvailabilityDialog";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgGoogleCalendarIntegration } from "@/components/org/workspace/OrgGoogleCalendarIntegration";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { Badge } from "@/components/ui/badge";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Code } from "@/components/ui/code";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useAddOrgSlackChannel,
  useConnectOrgSlack,
  useCreateOrgSlackChannel,
  useDisconnectOrgSlack,
  useOrgSlackStatus,
  useRemoveOrgSlackChannel,
} from "@/hooks/org/useOrgSlack";
import { useOrgMeetingAvailability } from "@/hooks/org/useOrgMeetingAvailability";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { ISO_WEEKDAYS } from "@/lib/meetings/availability";
import {
  getSlackChannelNameError,
  normalizeSlackChannelName,
  SLACK_CHANNEL_NAME_MAX_LENGTH,
} from "@/lib/org/slackChannelCreation";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/useToastStore";

function formatChannel(
  value: string | null | undefined,
  channelId?: string | null
) {
  const channel = String(value ?? "").trim();
  if (!channel) return channelId ? `채널 ${channelId}` : "선택한 채널";
  return channel.startsWith("#") ? channel : `#${channel}`;
}

export function OrgSettingsPage() {
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
  const [creatingChannelIsPrivate, setCreatingChannelIsPrivate] =
    useState(false);
  const [creatingChannelName, setCreatingChannelName] = useState("");
  const [creatingChannelNameError, setCreatingChannelNameError] = useState<
    string | null
  >(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [removeChannelId, setRemoveChannelId] = useState<string | null>(null);
  const [newChannelId, setNewChannelId] = useState("");
  const statusQuery = useOrgSlackStatus({
    enabled: activeIntegration === "slack",
    workspaceId: workspace.workspaceId,
  });
  const connectSlack = useConnectOrgSlack();
  const addSlackChannel = useAddOrgSlackChannel(workspace.workspaceId);
  const createSlackChannel = useCreateOrgSlackChannel(workspace.workspaceId);
  const disconnectSlack = useDisconnectOrgSlack(workspace.workspaceId);
  const removeSlackChannel = useRemoveOrgSlackChannel(workspace.workspaceId);
  const status = statusQuery.data;
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
    addToast({
      message:
        result === "connected"
          ? "Slack을 연결했어요."
          : message || "Slack 연결을 완료하지 못했습니다.",
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
  }, [addToast, router, router.isReady, router.query]);

  const connect = async () => {
    try {
      const payload = await connectSlack.mutateAsync({
        returnTo: router.asPath,
        workspaceId: workspace.workspaceId,
      });
      window.location.assign(payload.authorizeUrl);
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "Slack 연결을 시작하지 못했습니다.",
        variant: "error",
      });
    }
  };

  const addChannel = async () => {
    if (!newChannelId) return;
    try {
      await addSlackChannel.mutateAsync({
        channelId: newChannelId,
      });
      const channel = status?.availableChannels.find(
        (item) => item.channelId === newChannelId
      );
      setNewChannelId("");
      addToast({
        message: `${formatChannel(channel?.channelName, newChannelId)}을 Harper 채널로 추가했습니다.`,
        variant: "success",
      });
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "Slack 채널을 추가하지 못했습니다.",
        variant: "error",
      });
    }
  };

  const handleCreateChannelOpenChange = (open: boolean) => {
    if (!open && createSlackChannel.isPending) return;
    setCreateChannelOpen(open);
    if (!open) {
      setCreatingChannelIsPrivate(false);
      setCreatingChannelName("");
      setCreatingChannelNameError(null);
    }
  };

  const createChannel = async () => {
    const channelName = normalizeSlackChannelName(creatingChannelName);
    const nameError = getSlackChannelNameError(channelName);
    if (nameError) {
      setCreatingChannelNameError(nameError);
      return;
    }
    try {
      const payload = await createSlackChannel.mutateAsync({
        channelName,
        isPrivate: creatingChannelIsPrivate,
      });
      handleCreateChannelOpenChange(false);
      const formattedChannel = formatChannel(
        payload.channel.channelName,
        payload.channel.channelId
      );
      const followUp = !payload.creatingUserInvited
        ? " Slack 계정을 찾지 못해 본인은 자동으로 초대하지 못했어요. Slack 관리자에게 채널 초대를 요청해 주세요."
        : !payload.welcomeMessageSent
          ? " Harper의 첫 안내 메시지는 보내지 못했지만 채널 연결은 유지돼요."
          : "";
      addToast({
        message: `${formattedChannel} 채널을 만들고 Harper에 연결했어요.${followUp}`,
        variant: "success",
      });
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "Slack 채널을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
        variant: "error",
      });
    }
  };

  const removeChannel = async () => {
    if (!removeChannelId) return;
    try {
      await removeSlackChannel.mutateAsync(removeChannelId);
      setRemoveChannelId(null);
      addToast({
        message: `${formatChannel(channelToRemove?.channelName, removeChannelId)} 연결을 제거했습니다.`,
      });
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "Slack 채널을 제거하지 못했습니다.",
        variant: "error",
      });
    }
  };

  const disconnect = async () => {
    try {
      await disconnectSlack.mutateAsync();
      setDisconnectOpen(false);
      addToast({ message: "Slack 연결을 해제했습니다." });
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "Slack 연결을 해제하지 못했습니다.",
        variant: "error",
      });
    }
  };

  const mutationError =
    connectSlack.error ??
    addSlackChannel.error ??
    createSlackChannel.error ??
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
        description="팀이 중요한 채용 변화를 놓치지 않도록 연동과 알림을 설정하세요."
        title="Integrations"
      />

      <div
        aria-label="연동 선택"
        className="w-full flex flex-row gap-2 mb-8"
        role="group"
      >
        <SettingCardButton
          activeIntegration={activeIntegration}
          selectIntegration={selectIntegration}
          title="Slack"
          description="팀과 함께 추천 소식과 채용 결정을 확인하세요."
          icon={
            <Image
              alt=""
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
          title="Calendar"
          description="미팅이 가능한 일정을 관리하세요."
          icon={
            <Image
              alt=""
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
          description="후보자 추천과 검토, 역할 기준 변경, 후보자 프로세스 종료를 Slack 채널에서 팀원과 함께 진행하세요."
          title={
            <span className="inline-flex flex-col items-start gap-3">
              <div className="border border-neutral-1000-a05 rounded-xl p-2">
                <Image
                  alt=""
                  height={36}
                  src="/images/logos/slack.svg"
                  width={36}
                />
              </div>
              <div className="text-xl font-medium text-neutral-primary">
                Slack
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
              message={
                statusQuery.error instanceof Error
                  ? statusQuery.error.message
                  : "Slack 상태를 불러오지 못했습니다."
              }
              onRetry={() => void statusQuery.refetch()}
            />
          ) : status?.connected ? (
            <div className="space-y-6">
              <div className="relative w-full flex items-center justify-center overflow-hidden rounded-3xl p-7">
                <Image
                  alt=""
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
                      연결된 채널 {status.channels.length}개
                    </div>
                  </div>
                  {permissions.canManageIntegrations ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <MuteButton
                          aria-label="Slack 연결 관리"
                          className="self-start sm:self-auto gap-6"
                          size="md"
                          variant="default"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="size-2 rounded-full bg-positive"
                            />
                            연결됨
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
                          연결 끊기
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="inline-flex items-center gap-2 self-start text-[13px] font-medium text-neutral-primary sm:self-auto">
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full bg-positive"
                      />
                      연결됨
                    </span>
                  )}
                </div>
              </div>

              {permissions.canManageIntegrations &&
              !status.canCreateChannels ? (
                <div className="flex flex-col gap-3 rounded-md bg-info-faded px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[13px] font-medium text-neutral-primary">
                      Slack 채널 생성 권한이 필요해요
                    </div>
                    <p className="mt-1 text-[12px] font-light leading-5 text-neutral-muted">
                      Slack을 다시 연결해 공개·비공개 채널 생성 권한을 승인해
                      주세요. 기존 채널 연결은 유지돼요.
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
                    Slack 다시 연결
                  </MuteButton>
                </div>
              ) : null}

              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-[14px] font-medium text-neutral-primary">
                    연결된 채널
                  </h3>
                  {permissions.canManageIntegrations ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {status.availableChannels.length > 0 ? (
                        <>
                          <select
                            aria-label="기존 Slack 채널"
                            className="h-9 rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 text-[13px]"
                            onChange={(event) =>
                              setNewChannelId(event.target.value)
                            }
                            value={newChannelId}
                          >
                            <option value="">채널 선택</option>
                            {status.availableChannels.map((channel) => (
                              <option
                                key={channel.channelId}
                                value={channel.channelId}
                              >
                                {formatChannel(
                                  channel.channelName,
                                  channel.channelId
                                )}
                                {channel.isPrivate ? " (private)" : ""}
                              </option>
                            ))}
                          </select>
                          <MuteButton
                            disabled={
                              addSlackChannel.isPending || !newChannelId
                            }
                            onClick={() => void addChannel()}
                            size="md"
                          >
                            {addSlackChannel.isPending ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : null}
                            선택된 채널 연결
                          </MuteButton>
                          <MuteButton
                            disabled={
                              createSlackChannel.isPending ||
                              !status.canCreateChannels
                            }
                            onClick={() => setCreateChannelOpen(true)}
                            size="sm"
                            variant="primary"
                            className="md:mt-0 mt-4 flex"
                          >
                            <Plus className="size-4" />
                            Slack 채널 만들기
                          </MuteButton>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {permissions.canManageIntegrations ? (
                  <div className="mt-3 w-full flex flex-col md:flex-row items-center justify-between">
                    <p className="text-[12px] font-light leading-5 text-neutral-soft">
                      비공개 채널에 연결하려면 Slack의 해당 채널에서 먼저{" "}
                      <Code>/invite @Harper</Code>를 한 뒤 현재 페이지에서
                      새로고침 후 목록에서 선택해 주세요.
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 border-t border-neutral-1000-a05">
                  {status.channels.map((channel) => (
                    <div
                      className="flex flex-col gap-3 px-3 py-3.5 sm:flex-row sm:items-center"
                      key={channel.channelId}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-1000-a05 text-neutral-muted">
                          <SlackIcon
                            className="size-4"
                            color="currentColor"
                            fill="currentColor"
                          />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[14px] font-normal text-neutral-primary">
                              {formatChannel(
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
                                ? "@Harper 활성"
                                : "알림 전용"}
                            </Badge>
                          </div>
                          <div className="mt-1 text-[12px] font-light text-neutral-muted">
                            메시지에서 Role 자동 선택
                            {channel.replyToHarperThreads
                              ? " · Harper 스레드 답글 활성"
                              : ""}
                          </div>
                        </div>
                      </div>
                      {permissions.canManageIntegrations ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <MuteButton
                              aria-label={`${formatChannel(channel.channelName, channel.channelId)} 작업`}
                              size="sm"
                              variant="transparent"
                            >
                              <Ellipsis className="size-4" />
                            </MuteButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              disabled={removeSlackChannel.isPending}
                              onSelect={() =>
                                setRemoveChannelId(channel.channelId)
                              }
                              tone="danger"
                            >
                              <Trash2 />
                              채널 제거
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
                  Slack 연결
                  {connectSlack.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <></>
                  )}
                </MuteButton>
              ) : (
                <p className="mt-4 text-[12px] font-light text-neutral-soft">
                  Slack 연결은 Owner 또는 Admin이 설정할 수 있습니다.
                </p>
              )}
            </div>
          )}

          {mutationError ? (
            <div className="mt-4 rounded-md border border-critical/20 bg-critical-faded px-3 py-3 text-[12px] leading-5 text-critical">
              {mutationError instanceof Error
                ? mutationError.message
                : "Slack 요청을 처리하지 못했습니다."}
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
                aria-label="내 인터뷰 가능 시간 설정 열기"
                className="min-h-[88px] flex flex-row items-center gap-4 text-left"
              >
                <span className="flex min-w-0 items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-faded text-primary">
                    <CalendarClock className="size-5" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-[14px] font-normal text-neutral-primary">
                      인터뷰 일정
                      {availability ? (
                        <Badge
                          radius="full"
                          size="sm"
                          tone="positive"
                          variant="faded"
                        >
                          설정됨
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[13px] font-light leading-5 text-neutral-muted">
                      후보자에게 인터뷰 일정을 요청할 때 Harper가 제안할 수 있는
                      내 일정을 관리하세요.
                    </span>
                  </span>
                </span>
                <MuteButton
                  type="button"
                  variant="default"
                  className="w-[80px]"
                  onClick={() => void openAvailability()}
                >
                  열기
                  <ArrowRight className="size-3" />
                </MuteButton>
              </div>
              <div
                aria-hidden="true"
                className="flex flex-row gap-1 mt-2 ml-14"
              >
                {ISO_WEEKDAYS.map(({ key, shortLabel }) => {
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
                      {shortLabel}
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

      <Dialog
        open={createChannelOpen}
        onOpenChange={handleCreateChannelOpenChange}
      >
        <DialogContent className="max-w-md gap-0 rounded-lg p-6">
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void createChannel();
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-[18px]">
                Slack 채널 만들기
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-5">
                채널을 만들면 Harper가 바로 참여하고 연결돼요.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <label
                className="text-[13px] font-medium text-neutral-primary"
                htmlFor="slack-channel-name"
              >
                채널 이름
              </label>
              <Input
                aria-describedby="slack-channel-name-message"
                aria-invalid={Boolean(creatingChannelNameError)}
                autoCapitalize="none"
                autoComplete="off"
                autoFocus
                disabled={createSlackChannel.isPending}
                id="slack-channel-name"
                maxLength={SLACK_CHANNEL_NAME_MAX_LENGTH}
                onChange={(event) => {
                  setCreatingChannelName(event.target.value);
                  setCreatingChannelNameError(null);
                }}
                placeholder="예: hiring-team"
                spellCheck={false}
                value={creatingChannelName}
              />
              <p
                className={cn(
                  "text-[12px] font-light leading-5",
                  creatingChannelNameError
                    ? "text-critical"
                    : "text-neutral-muted"
                )}
                id="slack-channel-name-message"
              >
                {creatingChannelNameError ??
                  "영문 소문자, 숫자, 하이픈(-), 밑줄(_)을 사용할 수 있어요."}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md bg-neutral-100 px-3 py-3">
              <div>
                <div
                  className="text-[13px] font-medium text-neutral-primary flex flex-row items-center gap-1"
                  id="slack-channel-private-label"
                >
                  <Lock className="size-3" />
                  비공개 채널
                </div>
                <p
                  className="mt-1 text-[12px] font-light leading-5 text-neutral-muted"
                  id="slack-channel-private-description"
                >
                  제한된 Slack 멤버만 참여를 허용합니다.
                </p>
              </div>
              <Switch
                aria-describedby="slack-channel-private-description"
                aria-labelledby="slack-channel-private-label"
                checked={creatingChannelIsPrivate}
                disabled={createSlackChannel.isPending}
                onCheckedChange={setCreatingChannelIsPrivate}
              />
            </div>

            <DialogFooter>
              <MuteButton
                disabled={createSlackChannel.isPending}
                onClick={() => handleCreateChannelOpenChange(false)}
                size="md"
                type="button"
              >
                취소
              </MuteButton>
              <MuteButton
                disabled={
                  createSlackChannel.isPending || !creatingChannelName.trim()
                }
                size="md"
                type="submit"
                variant="primary"
              >
                {createSlackChannel.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                채널 만들고 연결하기
              </MuteButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="max-w-md gap-4 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[18px]">
              Slack 연결을 해제할까요?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              연결된 모든 채널로 더 이상 Organization 알림이 발송되지 않습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <MuteButton
              disabled={disconnectSlack.isPending}
              onClick={() => setDisconnectOpen(false)}
              size="md"
            >
              취소
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
              연결 해제
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(removeChannelId)}
        onOpenChange={(open) => {
          if (!open) setRemoveChannelId(null);
        }}
      >
        <DialogContent className="max-w-md gap-4 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[18px]">
              Slack 채널을 제거할까요?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              {formatChannel(
                channelToRemove?.channelName,
                channelToRemove?.channelId
              )}
              로는 더 이상 Organization 알림이 발송되지 않습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <MuteButton
              disabled={removeSlackChannel.isPending}
              onClick={() => setRemoveChannelId(null)}
              size="md"
            >
              취소
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
              채널 제거
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
