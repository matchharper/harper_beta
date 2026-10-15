import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { LoaderCircle, Lock } from "lucide-react";
import { useId, useState } from "react";
import { MuteButton } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCreateOrgSlackChannel } from "@/hooks/org/useOrgSlack";
import {
  getSlackChannelNameError,
  normalizeSlackChannelName,
  SLACK_CHANNEL_NAME_MAX_LENGTH,
} from "@/lib/org/slackChannelCreation";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/useToastStore";

export function OrgSlackCreateChannelDialog({
  initialName = "",
  onCreated,
  onOpenChange,
  open,
  workspaceId,
}: {
  initialName?: string;
  onCreated?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  workspaceId: string;
}) {
  const modalFormId1 = useId();

  const { locale, c } = useOrgLocale();
  const addToast = useToastStore((state) => state.add);
  const createSlackChannel = useCreateOrgSlackChannel(workspaceId);
  const nameId = useId();
  const [channelName, setChannelName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && createSlackChannel.isPending) return;
    onOpenChange(nextOpen);
  };

  const createChannel = async () => {
    if (createSlackChannel.isPending) return;
    const normalizedName = normalizeSlackChannelName(channelName);
    const error = getSlackChannelNameError(normalizedName, locale);
    if (error) {
      setNameError(error);
      return;
    }
    try {
      const payload = await createSlackChannel.mutateAsync({
        channelName: normalizedName,
        isPrivate,
      });
      onOpenChange(false);
      onCreated?.();
      const name = payload.channel.channelName || payload.channel.channelId;
      const formattedName = name.startsWith("#") ? name : `#${name}`;
      const followUp = !payload.creatingUserInvited
        ? c(
            " Slack 계정을 찾지 못해 본인은 자동으로 초대하지 못했어요. Slack 관리자에게 채널 초대를 요청해 주세요.",
            " Harper couldn't find a Slack account and couldn't auto-invite itself. Request a channel invite from a Slack admin."
          )
        : !payload.welcomeMessageSent
          ? c(
              " Harper의 첫 안내 메시지는 보내지 못했지만 채널 연결은 유지돼요.",
              " Harper's initial welcome message couldn't be sent, but the channel connection remains."
            )
          : "";
      addToast({
        message: c(
          "{p0} 채널을 만들고 Harper에 연결했어요.{p1}",
          "Created {p0} channel and connected it to Harper. {p1}",
          {
            p0: formattedName,
            p1: followUp,
          }
        ),
        variant: "success",
      });
    } catch (error) {
      addToast({
        message: localizedOrgErrorMessage(
          error,
          locale,
          c(
            "Slack 채널을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
            "Failed to create Slack channel. Try again later."
          )
        ),
        variant: "error",
      });
    }
  };

  return (
    <TalentCareerModal
      open={open}
      onClose={() => changeOpen(false)}
      mobileBottomSheet
      title={<>{c("Slack 채널 만들기", "Create Slack channel")}</>}
      description={
        <>
          {c(
            "채널을 만들면 Harper가 바로 참여하고 연결돼요.",
            "Harper joins and connects automatically when the channel is created."
          )}
        </>
      }
      panelClassName="max-w-md"
      bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MuteButton
            disabled={createSlackChannel.isPending}
            onClick={() => changeOpen(false)}
            size="md"
            type="button"
            form={modalFormId1}
          >
            {c("취소", "Cancel")}
          </MuteButton>
          <MuteButton
            disabled={createSlackChannel.isPending || !channelName.trim()}
            size="md"
            type="submit"
            variant="primary"
            form={modalFormId1}
          >
            {createSlackChannel.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            {c("채널 만들고 연결하기", "Create and connect channel")}
          </MuteButton>
        </div>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void createChannel();
        }}
        id={modalFormId1}
      >
        <div className="space-y-2">
          <label
            className="text-[13px] font-medium text-neutral-primary"
            htmlFor={nameId}
          >
            {c("채널 이름", "Channel name")}
          </label>
          <Input
            aria-describedby={`${nameId}-message`}
            aria-invalid={Boolean(nameError)}
            autoCapitalize="none"
            autoComplete="off"
            autoFocus
            disabled={createSlackChannel.isPending}
            id={nameId}
            maxLength={SLACK_CHANNEL_NAME_MAX_LENGTH}
            onChange={(event) => {
              setChannelName(event.target.value);
              setNameError(null);
            }}
            placeholder={c("예: hiring-team", "e.g. hiring-team")}
            spellCheck={false}
            value={channelName}
          />
          <p
            className={cn(
              "text-[12px] font-light leading-5",
              nameError ? "text-critical" : "text-neutral-muted"
            )}
            id={`${nameId}-message`}
          >
            {nameError ??
              c(
                "영문 소문자, 숫자, 하이픈(-), 밑줄(_)을 사용할 수 있어요.",
                "Lowercase letters, numbers, hyphens (-), and underscores (_) allowed."
              )}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md bg-neutral-100 px-3 py-3">
          <div>
            <div
              className="flex flex-row items-center gap-1 text-[13px] font-medium text-neutral-primary"
              id={`${nameId}-private-label`}
            >
              <Lock className="size-3" />
              {c("비공개 채널", "Private channel")}
            </div>
            <p
              className="mt-1 text-[12px] font-light leading-5 text-neutral-muted"
              id={`${nameId}-private-description`}
            >
              {c(
                "제한된 Slack 멤버만 참여를 허용합니다.",
                "Only selected Slack members can join."
              )}
            </p>
          </div>
          <Switch
            aria-describedby={`${nameId}-private-description`}
            aria-labelledby={`${nameId}-private-label`}
            checked={isPrivate}
            disabled={createSlackChannel.isPending}
            onCheckedChange={setIsPrivate}
          />
        </div>
      </form>
    </TalentCareerModal>
  );
}
