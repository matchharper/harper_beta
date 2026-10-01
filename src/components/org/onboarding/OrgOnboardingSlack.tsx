import { useOrgLocale, useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { useEffect, useState } from "react";
import { Check, LoaderCircle, Plus } from "lucide-react";
import { OrgSlackChannelPicker } from "@/components/org/OrgSlackChannelPicker";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useAddOrgSlackChannel,
  useConnectOrgSlack,
  useCreateOrgSlackChannel,
  type OrgSlackStatus,
} from "@/hooks/org/useOrgSlack";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import type { OrgInviteSendResponse } from "@/lib/org/server";
import { postOrgOnboarding } from "./client";
import Image from "next/image";

export type OrgOnboardingSlackPreview = {
  connect: () => void;
  connectChannel: (channelId: string, channelName?: string) => void;
  inviteOpen?: boolean;
};

export function OrgOnboardingSlack({
  status,
  returnTo,
  onBusyChange,
  onRefresh,
  refreshing = false,
  inviteOpen,
  onInviteOpenChange,
  preview: previewOptions,
}: {
  status?: OrgSlackStatus;
  returnTo: string;
  onBusyChange: (busy: boolean) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  inviteOpen: boolean;
  onInviteOpenChange: (open: boolean) => void;
  preview?: OrgOnboardingSlackPreview;
}) {
  const t = useOrgT();
  const { locale } = useOrgLocale();
  const preview =
    process.env.NODE_ENV !== "production" ? previewOptions : undefined;
  const { workspace, permissions } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const connect = useConnectOrgSlack();
  const add = useAddOrgSlackChannel(workspaceId);
  const create = useCreateOrgSlackChannel(workspaceId);
  const [createMode, setCreateMode] = useState(false);
  const [channelName, setChannelName] = useState("harper");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [invitedEmail, setInvitedEmail] = useState("");
  const busy =
    connect.isPending || add.isPending || create.isPending || invitePending;
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  const connectSlack = async () => {
    setError("");
    if (preview) {
      preview.connect();
      return;
    }
    try {
      const result = await connect.mutateAsync({ returnTo, workspaceId });
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      setError(localizedOrgErrorMessage(error, locale, t("onboarding.OrgOnboardingSlack.b1845655", "Slack 연결을 시작하지 못했어요.")));
    }
  };
  const inviteChannel = async (channelId: string) => {
    if (busy) return;
    setError("");
    if (preview) {
      preview.connectChannel(channelId);
      return;
    }
    try {
      await add.mutateAsync({ channelId });
    } catch (error) {
      setError(localizedOrgErrorMessage(error, locale, t("onboarding.OrgOnboardingSlack.43672e3f", "채널을 연결하지 못했어요.")));
    }
  };
  const createChannel = async () => {
    if (busy) return;
    setError("");
    if (preview) {
      preview.connectChannel("", channelName.trim());
      return;
    }
    try {
      await create.mutateAsync({ channelName: channelName.trim(), isPrivate });
    } catch (error) {
      setError(localizedOrgErrorMessage(error, locale, t("onboarding.OrgOnboardingSlack.43672e3f", "채널을 연결하지 못했어요.")));
    }
  };
  const invite = async () => {
    if (invitePending) return;
    if (preview) {
      setInvitedEmail(email.trim());
      return;
    }
    setInvitePending(true);
    setInviteError("");
    try {
      const result = await postOrgOnboarding<OrgInviteSendResponse>(
        workspaceId,
        { action: "invite", email: email.trim() }
      );
      const delivery = result.results[0];
      if (delivery?.status !== "sent")
        throw new Error(
          delivery?.message || t("onboarding.OrgOnboardingSlack.50a5d55c", "초대 메일을 보내지 못했어요.")
        );
      setInvitedEmail(delivery.email);
    } catch (error) {
      setInviteError(localizedOrgErrorMessage(error, locale, t("onboarding.OrgOnboardingSlack.50a5d55c", "초대 메일을 보내지 못했어요.")));
    } finally {
      setInvitePending(false);
    }
  };

  const connectedChannels =
    status?.channels.filter((channel) => channel.isEnabled) ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      {!permissions.canManageIntegrations ? (
        <p className="text-[13px] leading-6 text-neutral-muted">
          {t("onboarding.OrgOnboardingSlack.9b3e78dc", "Slack 연결은 회사의 Owner 또는 Admin이 설정할 수 있어요. 지금은 건너뛰고 Harper를 둘러보세요.")}
        </p>
      ) : !status?.connected ? (
        <MuteButton
          size="lg"
          variant="default"
          onClick={() => void connectSlack()}
          disabled={busy}
        >
          <Image
            src="/images/logos/slack.svg"
            alt={t("onboarding.OrgOnboardingSlack.eba14c55", "Slack")}
            width={16}
            height={16}
          />
          {connect.isPending
            ? t("onboarding.OrgOnboardingSlack.9121da14", "Slack으로 이동 중…")
            : t("onboarding.OrgOnboardingSlack.af9cd0e0", "Slack 연결하기")}
        </MuteButton>
      ) : connectedChannels.length ? (
        <div className="space-y-3">
          {connectedChannels.map((channel) => (
            <div
              key={channel.channelId}
              className="flex items-center gap-2 rounded-lg border border-neutral-1000-a10 p-4 text-[14px]"
            >
              <Check className="size-4 text-positive" />
              <span>#{channel.channelName || channel.channelId}</span>
            </div>
          ))}
          <p className="text-[13px] leading-6 text-neutral-muted">
            {t("onboarding.OrgOnboardingSlack.f70b7d30", "채널에서 @Harper를 불러 대화를 시작할 수 있어요.")}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {!createMode ? (
            <>
              <OrgSlackChannelPicker
                channels={status.availableChannels}
                disabled={busy}
                pendingChannelId={
                  add.isPending ? add.variables?.channelId : null
                }
                refreshing={refreshing}
                onInvite={(channelId) => void inviteChannel(channelId)}
                onCreate={
                  status.canCreateChannels
                    ? () => setCreateMode(true)
                    : undefined
                }
                onRefresh={onRefresh}
              />
              {!status.canCreateChannels ? (
                <MuteButton onClick={() => void connectSlack()} disabled={busy}>
                  {t("onboarding.OrgOnboardingSlack.f2cd61bc", "채널 생성 권한 추가하기")}
                </MuteButton>
              ) : null}
            </>
          ) : status.canCreateChannels ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void createChannel();
              }}
            >
              <label
                className="grid gap-2 text-[13px]"
                htmlFor="org-onboarding-new-channel"
              >
                {t("onboarding.OrgOnboardingSlack.179a29d2", "새 채널 이름")}
                <Input
                  id="org-onboarding-new-channel"
                  value={channelName}
                  onChange={(event) => setChannelName(event.target.value)}
                  required
                  maxLength={80}
                />
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox
                  checked={isPrivate}
                  onChange={(event) => setIsPrivate(event.target.checked)}
                />
                {t("onboarding.OrgOnboardingSlack.8c703d6f", "비공개 채널로 만들기")}
              </label>
              <MuteButton
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={busy || !channelName.trim()}
              >
                {create.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {t("onboarding.OrgOnboardingSlack.78e40040", "채널 만들고 연결하기")}
              </MuteButton>
              <MuteButton
                variant="transparent"
                onClick={() => setCreateMode(false)}
                disabled={busy}
              >
                {t("onboarding.OrgOnboardingSlack.9042181e", "기존 채널 보기")}
              </MuteButton>
            </form>
          ) : (
            <MuteButton onClick={() => void connectSlack()} disabled={busy}>
              {t("onboarding.OrgOnboardingSlack.f2cd61bc", "채널 생성 권한 추가하기")}
            </MuteButton>
          )}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-[13px] text-critical">
          {error}
        </p>
      ) : null}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (!invitePending) onInviteOpenChange(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("onboarding.OrgOnboardingSlack.83480060", "회사 이메일로 초대 보내기")}
            </DialogTitle>
            <DialogDescription>
              {t("onboarding.OrgOnboardingSlack.f6ca7fef", "Slack에서 사용하는 이메일로 이 회사의 초대 메일을 보내드려요. 현재 계정과 같은 권한으로 참여할 수 있어요.")}
            </DialogDescription>
          </DialogHeader>
          {invitedEmail ? (
            <>
              <p role="status" className="text-[14px] leading-6">
                {invitedEmail}
                {t("onboarding.OrgOnboardingSlack.317d1a3c", "로 초대 메일을 보냈어요. 그 이메일로 로그인한 뒤 Slack을 연결해 주세요.")}
              </p>
              <DialogFooter>
                <MuteButton onClick={() => onInviteOpenChange(false)}>
                  {t("onboarding.OrgOnboardingSlack.1bf3f5aa", "확인")}
                </MuteButton>
              </DialogFooter>
            </>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void invite();
              }}
            >
              <label
                htmlFor="org-onboarding-invite-email"
                className="grid gap-2 text-[13px]"
              >
                {t("onboarding.OrgOnboardingSlack.be15f47f", "회사 이메일")}
                <Input
                  autoFocus
                  id="org-onboarding-invite-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={320}
                  required
                />
              </label>
              {inviteError ? (
                <p role="alert" className="text-[13px] text-critical">
                  {inviteError}
                </p>
              ) : null}
              <DialogFooter>
                <MuteButton
                  type="submit"
                  variant="primary"
                  disabled={invitePending}
                >
                  {invitePending
                    ? t("onboarding.OrgOnboardingSlack.9eaf444d", "초대 보내는 중…")
                    : t("onboarding.OrgOnboardingSlack.63966ac6", "초대 메일 보내기")}
                </MuteButton>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
