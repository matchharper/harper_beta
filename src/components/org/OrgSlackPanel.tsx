import {
  Check,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  Send,
  Slack,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useConnectOrgSlack,
  useDisconnectOrgSlack,
  useOrgSlackStatus,
  useTestOrgSlack,
} from "@/hooks/org/useOrgSlack";
import type { OrgWorkspace } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";
import Image from "next/image";

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Slack 요청을 처리하지 못했습니다.";
}

function formatChannelName(value: string | null | undefined) {
  const channel = String(value ?? "").trim();
  if (!channel) return "선택한 채널";
  return channel.startsWith("#") ? channel : `#${channel}`;
}

export function OrgSlackPanel({
  onOpenChange,
  open,
  returnTo,
  workspace,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  returnTo: string;
  workspace: OrgWorkspace;
}) {
  const addToast = useToastStore((state) => state.add);
  const statusQuery = useOrgSlackStatus({
    enabled: open,
    workspaceId: workspace.workspaceId,
  });
  const connectSlack = useConnectOrgSlack();
  const testSlack = useTestOrgSlack(workspace.workspaceId);
  const disconnectSlack = useDisconnectOrgSlack(workspace.workspaceId);
  const status = statusQuery.data;
  const mutationError =
    connectSlack.error ?? testSlack.error ?? disconnectSlack.error;

  const handleConnect = async () => {
    const result = await connectSlack.mutateAsync({
      returnTo,
      workspaceId: workspace.workspaceId,
    });
    window.location.assign(result.authorizeUrl);
  };

  const handleTest = async () => {
    await testSlack.mutateAsync();
    addToast({
      message: "Slack 테스트 알림을 보냈습니다.",
      variant: "success",
    });
  };

  const handleDisconnect = async () => {
    if (!window.confirm("이 Workspace의 Slack 연결을 해제할까요?")) return;
    await disconnectSlack.mutateAsync();
    addToast({ message: "Slack 연결을 해제했습니다." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="left-auto right-0 top-0 flex h-dvh w-full max-w-[420px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 p-0 duration-300 data-[state=closed]:slide-out-to-right data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-right data-[state=open]:zoom-in-100"
        overlayClassName="backdrop-blur-none"
      >
        <div className="border-b border-neutral-1000-a05 px-5 py-5 pr-14">
          <DialogHeader>
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md border border-neutral-1000-a10 bg-bg-floating">
              <Image
                src="/images/logos/slack.svg"
                alt="Slack"
                width={20}
                height={20}
              />
            </div>
            <DialogTitle>Slack 연결</DialogTitle>
            <DialogDescription>
              {workspace.companyName}의 Organization 알림 채널
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {statusQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center text-neutral-muted">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </div>
          ) : statusQuery.error ? (
            <div className="rounded-md border border-critical/20 bg-critical/5 px-3 py-3 text-sm text-critical">
              {getErrorMessage(statusQuery.error)}
            </div>
          ) : status?.connected ? (
            <div className="space-y-5">
              <div className="rounded-md border border-neutral-1000-a10 bg-bg-floating px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-positive/10 text-positive">
                    <Check className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-neutral-primary">
                      연결됨
                    </div>
                    <div className="mt-1 truncate text-sm text-neutral-muted">
                      {status.teamName || "Slack"} ·{" "}
                      {formatChannelName(status.channelName)}
                    </div>
                  </div>
                </div>
              </div>

              <section>
                <h3 className="text-sm font-semibold text-neutral-primary">
                  발송 알림
                </h3>
                <div className="mt-3 divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05 text-sm text-neutral-muted">
                  <div className="py-3">Warm intro 요청</div>
                  <div className="py-3">후보자 프로세스 중단</div>
                  <div className="py-3">Organization 멤버 합류</div>
                </div>
              </section>

              {status.lastError ? (
                <div className="flex gap-2 rounded-md border border-critical/20 bg-critical/5 px-3 py-3 text-sm text-critical">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    최근 알림 발송에 실패했습니다. 테스트 후 다시 연결해 주세요.
                  </span>
                </div>
              ) : null}

              {mutationError ? (
                <div className="rounded-md border border-critical/20 bg-critical/5 px-3 py-3 text-sm text-critical">
                  {getErrorMessage(mutationError)}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={testSlack.isPending}
                  onClick={() => void handleTest()}
                >
                  {testSlack.isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Send />
                  )}
                  테스트 발송
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="md"
                  disabled={connectSlack.isPending}
                  onClick={() => void handleConnect()}
                >
                  {connectSlack.isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  채널 변경
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-primary">
                  Slack에서 바로 확인하세요
                </h3>
                <p className="mt-2 text-sm leading-6 text-neutral-muted">
                  후보자 진행 상황과 멤버 변경 알림을 선택한 채널로 보냅니다.
                </p>
              </div>

              {mutationError ? (
                <div className="rounded-md border border-critical/20 bg-critical/5 px-3 py-3 text-sm text-critical">
                  {getErrorMessage(mutationError)}
                </div>
              ) : null}

              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={connectSlack.isPending}
                onClick={() => void handleConnect()}
              >
                {connectSlack.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Image
                    src="/images/logos/slack.svg"
                    alt="Slack"
                    width={16}
                    height={16}
                  />
                )}
                Slack에 연결
              </Button>
            </div>
          )}
        </div>

        {status?.connected ? (
          <div className="border-t border-neutral-1000-a05 px-5 py-4">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="border-transparent bg-transparent px-0 text-critical hover:border-transparent hover:bg-transparent"
              disabled={disconnectSlack.isPending}
              onClick={() => void handleDisconnect()}
            >
              {disconnectSlack.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Unplug />
              )}
              연결 해제
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
