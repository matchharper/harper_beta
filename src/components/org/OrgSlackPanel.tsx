import { useOrgLocale, useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { Check, LoaderCircle, RefreshCw, Slack, Unplug } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import {
  useConnectOrgSlack,
  useDisconnectOrgSlack,
  useOrgSlackStatus,
} from "@/hooks/org/useOrgSlack";
import type { OrgWorkspace } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";
import Image from "next/image";

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
  const t = useOrgT();
  const { locale } = useOrgLocale();
  const errorFallback = t(
    "OrgSlackPanel.0b596162",
    "Slack 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
  );
  const addToast = useToastStore((state) => state.add);
  const statusQuery = useOrgSlackStatus({
    enabled: open,
    workspaceId: workspace.workspaceId,
  });
  const connectSlack = useConnectOrgSlack();
  const disconnectSlack = useDisconnectOrgSlack(workspace.workspaceId);
  const status = statusQuery.data;
  const mutationError = connectSlack.error ?? disconnectSlack.error;
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const handleConnect = async () => {
    const result = await connectSlack.mutateAsync({
      returnTo,
      workspaceId: workspace.workspaceId,
    });
    window.location.assign(result.authorizeUrl);
  };

  const handleDisconnect = async () => {
    if (disconnectSlack.isPending) return;
    try {
      await disconnectSlack.mutateAsync();
      setDisconnectOpen(false);
      addToast({
        message: t("OrgSlackPanel.f1d157b7", "Slack 연결을 해제했어요."),
      });
    } catch {
      // The mutation error remains visible in the confirmation modal.
    }
  };

  return (
    <>
      <TalentCareerModal
        open={open}
        onClose={() => onOpenChange(false)}
        mobileBottomSheet
        panelClassName="max-w-md"
        title={t("OrgSlackPanel.c1f9301b", "Slack")}
        description={
          <>
            {t(
              "OrgSlackPanel.c966e0e1",
              "{companyName}의 Organization 알림 채널",
              { companyName: workspace.companyName }
            )}
          </>
        }
        eyebrow={
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md border border-neutral-1000-a10 bg-bg-floating">
            <Image
              src="/images/logos/slack.svg"
              alt={t("OrgSlackPanel.c1f9301b", "Slack")}
              width={20}
              height={20}
            />
          </div>
        }
        bodyClassName="px-4 pb-5 sm:px-5"
      >
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {statusQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center text-neutral-muted">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </div>
          ) : statusQuery.error ? (
            <div className="rounded-md border border-critical/20 bg-critical/5 px-3 py-3 text-sm text-critical">
              {localizedOrgErrorMessage(
                statusQuery.error,
                locale,
                errorFallback
              )}
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
                      {t("OrgSlackPanel.71413681", "연결됨")}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-neutral-muted">
                      {t(
                        "OrgSlackPanel.connectedChannelCount",
                        "{teamName} · {count}개 채널",
                        {
                          teamName: status.teamName || "Slack",
                          count: status.channels.length,
                        }
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {status.needsReinstall ? (
                <div className="rounded-md border border-info/30 bg-info-faded px-3 py-3 text-[12px] leading-5 text-neutral-primary">
                  <div className="font-medium">
                    {t("OrgSlackPanel.9f3a7347", "Slack을 다시 연결해 주세요")}
                  </div>
                  <p className="mt-1 text-neutral-muted">
                    {t(
                      "OrgSlackPanel.7aa46fa0",
                      "Harper 멤버 확인과 PDF, DOCX, TXT 파일 읽기를 사용하려면 아래 다시 연결을 눌러 새 권한을 승인해 주세요."
                    )}
                  </p>
                </div>
              ) : null}

              <section>
                <h3 className="text-[12px] font-medium text-neutral-primary">
                  {t("OrgSlackPanel.b8066e27", "Slack notifications")}
                </h3>
                <div className="mt-2 divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05 text-[11px] text-neutral-muted">
                  <div className="py-2.5">
                    {t(
                      "OrgSlackPanel.06e3e327",
                      "역할 등록과 후보자 탐색 시작"
                    )}
                  </div>
                  <div className="py-2.5">
                    {t("OrgSlackPanel.db644a28", "후보자 연결 시작")}
                  </div>
                  <div className="py-2.5">
                    {t("OrgSlackPanel.8687b3bd", "후보자 연결 거절")}
                  </div>
                  <div className="py-2.5">
                    {t("OrgSlackPanel.1c4d61cb", "Organization 멤버 합류")}
                  </div>
                </div>
              </section>

              {mutationError ? (
                <div className="rounded-md border border-critical/20 bg-critical/5 px-3 py-3 text-sm text-critical">
                  {localizedOrgErrorMessage(
                    mutationError,
                    locale,
                    errorFallback
                  )}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <MuteButton
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
                  {t("OrgSlackPanel.d93fc452", "다시 연결")}
                </MuteButton>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-[14px] font-medium text-neutral-primary">
                  {t("OrgSlackPanel.cb72f2f9", "Slack에서 바로 확인하세요")}
                </h3>
                <p className="mt-1.5 text-[12px] leading-5 text-neutral-muted">
                  {t(
                    "OrgSlackPanel.24ebaded",
                    "역할과 후보자 진행 상황, 팀원 변경 알림을 선택한 채널로 보내요."
                  )}
                </p>
              </div>

              {mutationError ? (
                <div className="rounded-md border border-critical/20 bg-critical/5 px-3 py-3 text-sm text-critical">
                  {localizedOrgErrorMessage(
                    mutationError,
                    locale,
                    errorFallback
                  )}
                </div>
              ) : null}

              <MuteButton
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
                    alt={t("OrgSlackPanel.c1f9301b", "Slack")}
                    width={16}
                    height={16}
                  />
                )}
                {t("OrgSlackPanel.ba56a582", "Slack에 연결")}
              </MuteButton>
            </div>
          )}
        </div>

        {status?.connected ? (
          <div className="border-t border-neutral-1000-a05 px-4 py-3">
            <MuteButton
              type="button"
              variant="warn"
              size="sm"
              disabled={disconnectSlack.isPending}
              onClick={() => setDisconnectOpen(true)}
            >
              {disconnectSlack.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Unplug />
              )}
              {t("OrgSlackPanel.adcf7319", "연결 해제")}
            </MuteButton>
          </div>
        ) : null}
      </TalentCareerModal>
      <TalentCareerModal
        open={disconnectOpen}
        onClose={() => !disconnectSlack.isPending && setDisconnectOpen(false)}
        mobileBottomSheet
        closeOnBackdrop={!disconnectSlack.isPending}
        showCloseButton={!disconnectSlack.isPending}
        title={t(
          "OrgSlackPanel.1813e57c",
          "이 Workspace의 Slack 연결을 해제할까요?"
        )}
        panelClassName="max-w-md"
        bodyClassName="px-4 sm:px-5"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <MuteButton
              disabled={disconnectSlack.isPending}
              onClick={() => setDisconnectOpen(false)}
            >
              {t("CompanyIntroDecisionDialogs.2ab81060", "취소")}
            </MuteButton>
            <MuteButton
              variant="warn"
              disabled={disconnectSlack.isPending}
              onClick={() => void handleDisconnect()}
            >
              {disconnectSlack.isPending && (
                <LoaderCircle className="animate-spin" />
              )}
              {t("OrgSlackPanel.adcf7319", "연결 해제")}
            </MuteButton>
          </div>
        }
      >
        {disconnectSlack.error ? (
          <p role="alert" className="text-sm text-critical">
            {localizedOrgErrorMessage(
              disconnectSlack.error,
              locale,
              errorFallback
            )}
          </p>
        ) : null}
      </TalentCareerModal>
    </>
  );
}
