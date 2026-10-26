import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { useEffect, useState } from "react";
import { Check, LoaderCircle, Plus } from "lucide-react";
import { OrgSlackChannelPicker } from "@/components/org/OrgSlackChannelPicker";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

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
  const { locale, c } = useOrgLocale();
  const preview = previewOptions;
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
      setError(
        localizedOrgErrorMessage(
          error,
          locale,
          c(
            "Slack 연결을 시작하지 못했어요.",
            "Unable to start Slack connection."
          )
        )
      );
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
      setError(
        localizedOrgErrorMessage(
          error,
          locale,
          c("채널을 연결하지 못했어요.", "Failed to connect channel.")
        )
      );
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
      setError(
        localizedOrgErrorMessage(
          error,
          locale,
          c("채널을 연결하지 못했어요.", "Failed to connect channel.")
        )
      );
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
          delivery?.message ||
            c("초대 메일을 보내지 못했어요.", "Failed to send invite email.")
        );
      setInvitedEmail(delivery.email);
    } catch (error) {
      setInviteError(
        localizedOrgErrorMessage(
          error,
          locale,
          c("초대 메일을 보내지 못했어요.", "Failed to send invite email.")
        )
      );
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
          {c(
            "Slack 연결은 회사의 Owner 또는 Admin이 설정할 수 있어요. 지금은 건너뛰고 Harper를 둘러보세요.",
            "An Owner or Admin needs to connect Slack. You can skip this step and explore Harper for now."
          )}
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
            alt={c("Slack", "Slack")}
            width={16}
            height={16}
          />
          {connect.isPending
            ? c("Slack으로 이동 중…", "Redirecting to Slack…")
            : c("Slack 연결하기", "Connect Slack")}
        </MuteButton>
      ) : connectedChannels.length ? (
        <div className="space-y-3">
          {connectedChannels.map((channel) => (
            <div
              key={channel.channelId}
              className="flex items-center gap-2 rounded-full border border-neutral-1000-a10 px-3 py-2.5 text-[14px] text-neutral-800 shadow-xs"
            >
              <Check className="size-3.5 text-positive" />
              <span>#{channel.channelName || channel.channelId}</span>
            </div>
          ))}
          <p className="text-[13px] leading-6 text-neutral-muted">
            {c(
              "채널에서 @Harper를 불러 대화를 시작할 수 있어요.",
              "Mention @Harper in a channel to start a conversation."
            )}
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
                  {c(
                    "채널 생성 권한 추가하기",
                    "Grant channel creation permission"
                  )}
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
                {c("새 채널 이름", "New channel name")}
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
                {c("비공개 채널로 만들기", "Make channel private")}
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
                {c("채널 만들고 연결하기", "Create and connect channel")}
              </MuteButton>
              <MuteButton
                variant="transparent"
                onClick={() => setCreateMode(false)}
                disabled={busy}
              >
                {c("기존 채널 보기", "View existing channels")}
              </MuteButton>
            </form>
          ) : (
            <MuteButton onClick={() => void connectSlack()} disabled={busy}>
              {c(
                "채널 생성 권한 추가하기",
                "Grant channel creation permission"
              )}
            </MuteButton>
          )}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-[13px] text-critical">
          {error}
        </p>
      ) : null}
      <TalentCareerModal
        open={inviteOpen}
        onClose={() => {
          if (!invitePending) onInviteOpenChange(false);
        }}
        mobileBottomSheet
        title={
          <>{c("회사 이메일로 초대 보내기", "Invite your Slack account")}</>
        }
        description={
          <>
            {c(
              "Slack에서 사용하는 이메일로 이 회사의 초대 메일을 보내드려요. 현재 계정과 같은 권한으로 참여할 수 있어요.",
              "Send a workspace invitation to the email you use for Slack. That account will have the same permissions as your current account."
            )}
          </>
        }
        panelClassName="max-w-md"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
      >
        {invitedEmail ? (
          <>
            <p role="status" className="text-[14px] leading-6">
              {invitedEmail}
              {c(
                "로 초대 메일을 보냈어요. 그 이메일로 로그인한 뒤 Slack을 연결해 주세요.",
                "Invitation sent. Sign in with that email address, then connect Slack."
              )}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 ">
              <MuteButton onClick={() => onInviteOpenChange(false)}>
                {c("확인", "OK")}
              </MuteButton>
            </div>
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
              {c("회사 이메일", "Company email")}
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
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 ">
              <MuteButton
                type="submit"
                variant="primary"
                disabled={invitePending}
              >
                {invitePending
                  ? c("초대 보내는 중…", "Sending invite…")
                  : c("초대 메일 보내기", "Send invite email")}
              </MuteButton>
            </div>
          </form>
        )}
      </TalentCareerModal>
    </div>
  );
}
