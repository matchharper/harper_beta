import {
  Check,
  LoaderCircle,
  RefreshCw,
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
} from "@/hooks/org/useOrgSlack";
import type { OrgWorkspace } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";
import Image from "next/image";

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Slack 요청을 처리하지 못했습니다.";
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
  const disconnectSlack = useDisconnectOrgSlack(workspace.workspaceId);
  const status = statusQuery.data;
  const mutationError =
    connectSlack.error ?? disconnectSlack.error;

  const handleConnect = async () => {
    const result = await connectSlack.mutateAsync({
      returnTo,
      workspaceId: workspace.workspaceId,
    });
    window.location.assign(result.authorizeUrl);
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
        <div className="border-b border-neutral-1000-a05 px-4 py-4 pr-12">
          <DialogHeader>
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md border border-neutral-1000-a10 bg-bg-floating">
              <Image
                src="/images/logos/slack.svg"
                alt="Slack"
                width={20}
                height={20}
              />
            </div>
            <DialogTitle className="text-[16px]">Slack 연결</DialogTitle>
            <DialogDescription className="text-[12px]">
              {workspace.companyName}의 Organization 알림 채널
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {statusQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center text-neutral-muted">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </div>
          ) : statusQuery.error ? (
            <div className="rounded-md border border-critical/20 bg-critical/5 px-3 py-3 text-sm text-critical">
              {getErrorMessage(statusQuery.error)}
            </div>
          ) : status?.connected ? (
            <div className="space-y-4">
              <div className="rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-positive/10 text-positive">
                    <Check className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-neutral-primary">
                      연결됨
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-neutral-muted">
                      {status.teamName || "Slack"} · {status.channels.length}개
                      채널
                    </div>
                  </div>
                </div>
              </div>

              <section>
                <h3 className="text-[12px] font-medium text-neutral-primary">
                  발송 알림
                </h3>
                <div className="mt-2 divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05 text-[11px] text-neutral-muted">
                  <div className="py-2.5">Warm intro 요청</div>
                  <div className="py-2.5">후보자 프로세스 중단</div>
                  <div className="py-2.5">Organization 멤버 합류</div>
                </div>
              </section>

              {mutationError ? (
                <div className="rounded-md border border-critical/20 bg-critical/5 px-3 py-3 text-sm text-critical">
                  {getErrorMessage(mutationError)}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={connectSlack.isPending}
                  onClick={() => void handleConnect()}
                >
                  {connectSlack.isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  앱 다시 설치
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-[14px] font-medium text-neutral-primary">
                  Slack에서 바로 확인하세요
                </h3>
                <p className="mt-1.5 text-[12px] leading-5 text-neutral-muted">
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
                size="sm"
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
          <div className="border-t border-neutral-1000-a05 px-4 py-3">
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
