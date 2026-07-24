import { CircleAlert, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useConnectOrgSlack,
  useDisconnectOrgSlack,
  useOrgSlackStatus,
  useTestOrgSlack,
  useUpdateOrgSlackNotifications,
  type OrgSlackStatus,
} from "@/hooks/org/useOrgSlack";
import type { OrgPermissions } from "@/lib/org/permissions";
import type { OrgWorkspace } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";

const NOTIFICATION_OPTIONS: Array<{
  description: string;
  key: keyof OrgSlackStatus["notifications"];
  label: string;
}> = [
  {
    description: "후보자를 만나기로 결정하고 warm intro를 요청했을 때",
    key: "candidateAccepted",
    label: "후보자 연결 수락",
  },
  {
    description: "회사 또는 후보자 사유로 채용 프로세스가 중단됐을 때",
    key: "candidateRejected",
    label: "후보자 프로세스 중단",
  },
  {
    description: "초대한 사용자가 Organization에 처음 합류했을 때",
    key: "memberJoined",
    label: "새 멤버 합류",
  },
];

function formatChannel(value: string | null | undefined) {
  const channel = String(value ?? "").trim();
  if (!channel) return "선택한 채널";
  return channel.startsWith("#") ? channel : `#${channel}`;
}

function formatLastSentAt(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function OrgSettingsPage({
  permissions,
  workspace,
}: {
  permissions: OrgPermissions;
  workspace: OrgWorkspace;
}) {
  const router = useRouter();
  const addToast = useToastStore((state) => state.add);
  const handledSlackResult = useRef("");
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const statusQuery = useOrgSlackStatus({
    workspaceId: workspace.workspaceId,
  });
  const connectSlack = useConnectOrgSlack();
  const testSlack = useTestOrgSlack(workspace.workspaceId);
  const disconnectSlack = useDisconnectOrgSlack(workspace.workspaceId);
  const updateNotifications = useUpdateOrgSlackNotifications(
    workspace.workspaceId
  );
  const status = statusQuery.data;

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
          ? "Slack 채널을 연결했습니다."
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

  const test = async () => {
    try {
      await testSlack.mutateAsync();
      addToast({
        message: "Slack 테스트 알림을 보냈습니다.",
        variant: "success",
      });
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "테스트 알림을 보내지 못했습니다.",
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

  const toggleNotification = (
    key: keyof OrgSlackStatus["notifications"],
    checked: boolean
  ) => {
    if (!status) return;
    updateNotifications.mutate({
      ...status.notifications,
      [key]: checked,
    });
  };

  const mutationError =
    connectSlack.error ??
    testSlack.error ??
    disconnectSlack.error ??
    updateNotifications.error;

  return (
    <div className="space-y-8">
      <OrgPageHeader
        description="팀이 중요한 채용 변화를 놓치지 않도록 연동과 알림을 설정하세요."
        title="Settings"
      />

      <OrgSection>
        <OrgSectionHeader
          description="후보자 결정과 팀 변경을 선택한 Slack 채널에서 확인하세요."
          title={
            <span className="inline-flex items-center gap-2">
              <Image
                alt=""
                height={16}
                src="/images/logos/slack.svg"
                width={16}
              />
              Slack integration
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
              <div className="flex flex-col gap-4 border-y border-neutral-1000-a05 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full bg-positive"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-neutral-primary">
                        {status.teamName || "Slack"}
                      </span>
                      <Badge
                        radius="full"
                        size="sm"
                        tone="positive"
                        variant="faded"
                      >
                        연결됨
                      </Badge>
                    </div>
                    <div className="mt-1 text-[12px] font-light text-neutral-muted">
                      {formatChannel(status.channelName)}
                      {formatLastSentAt(status.lastSentAt)
                        ? ` · 최근 알림 ${formatLastSentAt(status.lastSentAt)}`
                        : ""}
                    </div>
                  </div>
                </div>
                {permissions.canManageIntegrations ? (
                  <div className="flex flex-wrap gap-2">
                    <MuteButton
                      disabled={testSlack.isPending}
                      onClick={() => void test()}
                      size="md"
                    >
                      {testSlack.isPending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : null}
                      테스트
                    </MuteButton>
                    <MuteButton
                      disabled={connectSlack.isPending}
                      onClick={() => void connect()}
                      size="md"
                    >
                      채널 변경
                    </MuteButton>
                  </div>
                ) : null}
              </div>

              <div>
                <h3 className="text-[14px] font-medium text-neutral-primary">
                  알림 종류
                </h3>
                <div className="mt-3 divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05">
                  {NOTIFICATION_OPTIONS.map((option) => (
                    <div
                      className="flex items-center gap-4 px-3 py-3.5"
                      key={option.key}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-normal text-neutral-primary">
                          {option.label}
                        </div>
                        <div className="mt-1 text-[12px] font-light leading-5 text-neutral-muted">
                          {option.description}
                        </div>
                      </div>
                      <Switch
                        aria-label={`${option.label} 알림`}
                        checked={status.notifications[option.key]}
                        disabled={
                          !permissions.canManageIntegrations ||
                          updateNotifications.isPending
                        }
                        onCheckedChange={(checked) =>
                          toggleNotification(option.key, checked)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              {status.lastError ? (
                <div className="flex gap-2 rounded-md border border-critical/20 bg-critical-faded px-3 py-3 text-[12px] font-normal leading-5 text-critical">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  최근 알림 발송에 실패했습니다. 테스트 발송 후에도 문제가
                  계속되면 채널을 다시 연결해 주세요.
                </div>
              ) : null}

              {permissions.canManageIntegrations ? (
                <MuteButton
                  onClick={() => setDisconnectOpen(true)}
                  size="md"
                  variant="warn"
                >
                  연결 해제
                </MuteButton>
              ) : (
                <p className="text-[12px] font-light text-neutral-soft">
                  Slack 설정은 Owner 또는 Admin이 변경할 수 있습니다.
                </p>
              )}
            </div>
          ) : (
            <div className="max-w-xl">
              <h3 className="text-[14px] font-medium text-neutral-primary">
                Slack에서 바로 확인하세요
              </h3>
              <p className="mt-2 text-[13px] font-light leading-6 text-neutral-muted">
                연결 수락, 프로세스 중단, 멤버 합류 알림을 팀이 함께 보는 채널로
                보냅니다.
              </p>
              {permissions.canManageIntegrations ? (
                <MuteButton
                  className="mt-5"
                  disabled={connectSlack.isPending}
                  onClick={() => void connect()}
                  size="md"
                  variant="primary"
                >
                  {connectSlack.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Image
                      alt=""
                      height={16}
                      src="/images/logos/slack.svg"
                      width={16}
                    />
                  )}
                  Slack에 연결
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

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="max-w-md gap-4 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[18px]">
              Slack 연결을 해제할까요?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              선택한 채널로 더 이상 Organization 알림이 발송되지 않습니다.
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
    </div>
  );
}
