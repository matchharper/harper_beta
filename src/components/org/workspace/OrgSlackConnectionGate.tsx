import { Check, Hash, LoaderCircle, RefreshCw } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { type ReactNode, useState } from "react";
import { MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type OrgSlackStatus,
  useAddOrgSlackChannel,
  useConnectOrgSlack,
  useOrgSlackStatus,
} from "@/hooks/org/useOrgSlack";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";

const CHANNEL_SELECTION_PREVIEW_STATUS: OrgSlackStatus = {
  availableChannels: [
    {
      channelId: "C_PREVIEW_GENERAL",
      channelName: "general",
      isPrivate: false,
    },
    {
      channelId: "C_PREVIEW_RECRUITING",
      channelName: "recruiting",
      isPrivate: false,
    },
    {
      channelId: "C_PREVIEW_HIRING",
      channelName: "hiring-team",
      isPrivate: true,
    },
  ],
  channels: [],
  connected: true,
  teamId: "T_PREVIEW_HARPER",
  teamName: "Harper",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Slack 연결 상태를 확인하지 못했습니다.";
}

export function OrgSlackConnectionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { internalOpsAccess, permissions, workspace } = useOrgWorkspace();
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [previewCompleted, setPreviewCompleted] = useState(false);
  const isChannelSelectionPreview =
    process.env.NODE_ENV === "development" &&
    router.query.slackPreview === "channel";
  const statusQuery = useOrgSlackStatus({
    enabled: !internalOpsAccess || isChannelSelectionPreview,
    workspaceId: workspace.workspaceId,
  });
  const connectSlack = useConnectOrgSlack();
  const addSlackChannel = useAddOrgSlackChannel(workspace.workspaceId);
  const status = isChannelSelectionPreview
    ? CHANNEL_SELECTION_PREVIEW_STATUS
    : statusQuery.data;
  const callbackError =
    router.query.slack === "error" &&
    typeof router.query.slackMessage === "string"
      ? router.query.slackMessage
      : "";

  if (internalOpsAccess && !isChannelSelectionPreview) {
    return <>{children}</>;
  }

  if (!isChannelSelectionPreview && statusQuery.isLoading) {
    return <>{children}</>;
  }

  if (previewCompleted || (status?.connected && status.channels.length > 0)) {
    return <>{children}</>;
  }

  const connect = () => {
    connectSlack.mutate(
      {
        returnTo: router.asPath,
        workspaceId: workspace.workspaceId,
      },
      {
        onSuccess: (payload) => window.location.assign(payload.authorizeUrl),
      }
    );
  };

  const addChannel = () => {
    if (!selectedChannelId) return;
    if (isChannelSelectionPreview) {
      setPreviewCompleted(true);
      return;
    }
    addSlackChannel.mutate({ channelId: selectedChannelId });
  };

  const errorMessage =
    !isChannelSelectionPreview && statusQuery.error
      ? getErrorMessage(statusQuery.error)
      : connectSlack.error
        ? getErrorMessage(connectSlack.error)
        : addSlackChannel.error
          ? getErrorMessage(addSlackChannel.error)
          : callbackError;
  const isChoosingChannel = Boolean(
    status?.connected && status.channels.length === 0
  );

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[680px] gap-0 overflow-x-hidden overflow-y-auto rounded-[24px] border-white/50 bg-transparent p-0 shadow-[0_30px_90px_rgba(11,38,72,0.28)] max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:max-h-[calc(100dvh-1.5rem)] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[24px] max-sm:border-b-0 max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=open]:zoom-in-100"
        hideCloseButton
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        overlayClassName="bg-black/55 backdrop-blur-[5px]"
      >
        <div className="relative isolate min-h-[min(540px,calc(100dvh-1.5rem))] p-3 pt-7 sm:min-h-[540px] sm:p-6">
          <Image
            alt=""
            aria-hidden="true"
            className="pointer-events-none -z-20 object-cover"
            fill
            priority
            sizes="(max-width: 639px) 100vw, (max-width: 720px) calc(100vw - 32px), 680px"
            src="/images/bluesky.jpg"
          />
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-3 z-10 h-1.5 w-12 -translate-x-1/2 rounded-full bg-white/65 shadow-sm sm:hidden"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-white/5 via-transparent to-[#0b315c]/20"
          />

          <div className="flex min-h-[min(500px,calc(100dvh-3.75rem))] flex-col sm:min-h-[492px]">
            <div className="flex items-center gap-3 text-white drop-shadow-sm">
              <span className="flex size-11 items-center justify-center rounded-xl border border-white/70 bg-white/90 shadow-sm backdrop-blur-sm">
                <Image
                  alt="Slack"
                  height={24}
                  src="/images/logos/slack.svg"
                  width={24}
                />
              </span>
              <div>
                <p className="text-[14px] font-medium">
                  Harper × {workspace.companyName}
                </p>
                <p className="text-[12px] font-normal text-white/80">
                  Slack Integration
                </p>
              </div>
            </div>

            <div className="mt-auto w-full rounded-[20px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(11,38,72,0.16)] backdrop-blur-xl sm:p-6">
              {!isChannelSelectionPreview && statusQuery.error ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-[20px]">
                      Slack 상태를 확인하지 못했어요
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-[13px] leading-5">
                      연결 상태를 확인해야 Organization을 계속 사용할 수
                      있습니다.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mt-4 rounded-lg border border-critical/20 bg-critical-faded px-3 py-2.5 text-[12px] leading-5 text-critical">
                    {errorMessage}
                  </div>
                  <MuteButton
                    className="mt-5 w-full"
                    disabled={statusQuery.isFetching}
                    onClick={() => void statusQuery.refetch()}
                    size="lg"
                    variant="dark"
                  >
                    {statusQuery.isFetching ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    다시 확인하기
                  </MuteButton>
                </>
              ) : isChoosingChannel && permissions.canManageIntegrations ? (
                <>
                  <DialogHeader>
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-positive">
                      <span className="flex size-5 items-center justify-center rounded-full bg-positive-faded">
                        <Check className="size-3.5" strokeWidth={2.5} />
                      </span>
                      {status?.teamName || "Slack"} 연결 완료
                    </div>
                    <DialogTitle className="text-[20px] tracking-[-0.02em]">
                      알림을 받을 채널을 선택하세요
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-[13px] leading-5 text-neutral-muted">
                      Harper가 후보자 소식과 채용 진행 상황을 전할 Slack 채널을
                      선택해 주세요.
                    </DialogDescription>
                  </DialogHeader>

                  {status && status.availableChannels.length > 0 ? (
                    <div className="mt-5">
                      <label
                        className="mb-2 block text-[12px] font-medium text-neutral-primary"
                        htmlFor="org-slack-channel"
                      >
                        Slack 채널
                      </label>
                      <Select
                        items={status.availableChannels.map((channel) => ({
                          label: `${channel.channelName || channel.channelId}${
                            channel.isPrivate ? " · 비공개" : ""
                          }`,
                          value: channel.channelId,
                        }))}
                        onValueChange={(value) =>
                          setSelectedChannelId(value ?? "")
                        }
                        value={selectedChannelId}
                      >
                        <SelectTrigger className="h-11" id="org-slack-channel">
                          <span className="flex min-w-0 items-center gap-2">
                            <Hash className="size-4 shrink-0 text-neutral-muted" />
                            <SelectValue placeholder="채널을 선택해 주세요" />
                          </span>
                        </SelectTrigger>
                        <SelectContent align="start">
                          {status.availableChannels.map((channel) => (
                            <SelectItem
                              key={channel.channelId}
                              value={channel.channelId}
                            >
                              {channel.channelName || channel.channelId}
                              {channel.isPrivate ? " · 비공개" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-[11px] leading-4 text-neutral-soft">
                        비공개 채널은 Slack에서 먼저 /invite @Harper를 입력해
                        주세요.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-lg bg-bg-weak px-3 py-3 text-[12px] leading-5 text-neutral-muted">
                      선택할 수 있는 채널이 없습니다. Slack에서 Harper를 원하는
                      채널에 초대한 뒤 다시 확인해 주세요.
                    </div>
                  )}

                  {errorMessage && (
                    <div className="mt-4 rounded-lg border border-critical/20 bg-critical-faded px-3 py-2.5 text-[12px] leading-5 text-critical">
                      {errorMessage}
                    </div>
                  )}

                  {status && status.availableChannels.length > 0 ? (
                    <MuteButton
                      className="mt-5 w-full"
                      disabled={addSlackChannel.isPending || !selectedChannelId}
                      onClick={addChannel}
                      size="lg"
                      variant="dark"
                    >
                      {addSlackChannel.isPending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : null}
                      채널 선택하고 시작하기
                    </MuteButton>
                  ) : (
                    <MuteButton
                      className="mt-4 w-full"
                      disabled={statusQuery.isFetching}
                      onClick={() => void statusQuery.refetch()}
                      size="lg"
                    >
                      {statusQuery.isFetching ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      채널 목록 다시 확인하기
                    </MuteButton>
                  )}
                </>
              ) : isChoosingChannel ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-[20px] tracking-[-0.02em]">
                      Slack 채널 선택이 필요해요
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-[13px] leading-5 text-neutral-muted">
                      {workspace.companyName} Workspace의 Owner 또는 Admin에게
                      알림을 받을 채널을 선택해 달라고 요청해 주세요.
                    </DialogDescription>
                  </DialogHeader>
                  <MuteButton
                    className="mt-5 w-full"
                    disabled={statusQuery.isFetching}
                    onClick={() => void statusQuery.refetch()}
                    size="lg"
                    variant="dark"
                  >
                    {statusQuery.isFetching ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    채널 상태 다시 확인하기
                  </MuteButton>
                </>
              ) : permissions.canManageIntegrations ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-[20px] tracking-[-0.02em]">
                      Slack을 연결해서 시작하세요
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-[13px] leading-5 text-neutral-muted">
                      Harper가 연결시켜드릴 수 있는 후보자가 생겼을 때 그리고
                      채용 진행 상황을 팀의 Slack으로 알려드려요. Slack 연결을
                      완료해야 Harper를 사용할 수 있습니다.
                    </DialogDescription>
                  </DialogHeader>

                  <p className="mt-5 mb-2 text-[13px] leading-5 text-neutral-primary">
                    Slack에서 Harper와 실제 리크루터처럼 소통해보세요. ex) 이
                    후보자 이력서를 요청하고 받아서 알려줘, 이 사람 지금
                    relocation에도 열려있는거야? 등
                  </p>

                  {errorMessage && (
                    <div className="mt-4 rounded-lg border border-critical/20 bg-critical-faded px-3 py-2.5 text-[12px] leading-5 text-critical">
                      {errorMessage}
                    </div>
                  )}

                  <MuteButton
                    className="mt-5 w-full"
                    disabled={connectSlack.isPending}
                    onClick={connect}
                    size="lg"
                    variant="dark"
                  >
                    {connectSlack.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Image
                        alt=""
                        aria-hidden="true"
                        height={18}
                        src="/images/logos/slack.svg"
                        width={18}
                      />
                    )}
                    Slack 연결하고 계속하기
                  </MuteButton>
                  <p className="mt-3 text-center text-[11px] leading-4 text-neutral-soft">
                    Slack 권한 승인 후 이 화면으로 자동으로 돌아옵니다.
                  </p>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-[22px] tracking-[-0.02em]">
                      Slack 연결이 필요해요
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-[13px] leading-5 text-neutral-muted">
                      {workspace.companyName} Workspace는 Slack 연결 후 사용할
                      수 있습니다. Owner 또는 Admin에게 연결을 요청해 주세요.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mt-5 border-y border-neutral-1000-a05 py-4 text-[13px] leading-6 text-neutral-primary">
                    관리자가 연결을 완료하면 새로고침 없이 아래 버튼으로 상태를
                    다시 확인할 수 있어요.
                  </div>
                  <MuteButton
                    className="mt-5 w-full"
                    disabled={statusQuery.isFetching}
                    onClick={() => void statusQuery.refetch()}
                    size="lg"
                    variant="dark"
                  >
                    {statusQuery.isFetching ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    연결 상태 다시 확인하기
                  </MuteButton>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
