import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useOrgLocale, useOrgT } from "@/i18n/org/OrgLocaleProvider";
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
  const t = useOrgT();
  const { locale } = useOrgLocale();
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
        ? t(
            "workspace.pages.OrgSettingsPage.fcfadfe7",
            " Slack 계정을 찾지 못해 본인은 자동으로 초대하지 못했어요. Slack 관리자에게 채널 초대를 요청해 주세요."
          )
        : !payload.welcomeMessageSent
          ? t(
              "workspace.pages.OrgSettingsPage.35d14bc9",
              " Harper의 첫 안내 메시지는 보내지 못했지만 채널 연결은 유지돼요."
            )
          : "";
      addToast({
        message: t(
          "workspace.pages.OrgSettingsPage.7ea9391f",
          "{p0} 채널을 만들고 Harper에 연결했어요.{p1}",
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
          t(
            "workspace.pages.OrgSettingsPage.86b4038a",
            "Slack 채널을 만들지 못했어요. 잠시 후 다시 시도해 주세요."
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
      title={
        <>
          {t("workspace.pages.OrgSettingsPage.950b7834", "Slack 채널 만들기")}
        </>
      }
      description={
        <>
          {t(
            "workspace.pages.OrgSettingsPage.0d89bd18",
            "채널을 만들면 Harper가 바로 참여하고 연결돼요."
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
            {t("workspace.pages.OrgSettingsPage.084f2f6a", "취소")}
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
            {t(
              "workspace.pages.OrgSettingsPage.67b22260",
              "채널 만들고 연결하기"
            )}
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
            {t("workspace.pages.OrgSettingsPage.68d018f6", "채널 이름")}
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
            placeholder={t(
              "workspace.pages.OrgSettingsPage.d2073417",
              "예: hiring-team"
            )}
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
              t(
                "workspace.pages.OrgSettingsPage.5ae0f4ac",
                "영문 소문자, 숫자, 하이픈(-), 밑줄(_)을 사용할 수 있어요."
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
              {t("workspace.pages.OrgSettingsPage.cbcc58af", "비공개 채널")}
            </div>
            <p
              className="mt-1 text-[12px] font-light leading-5 text-neutral-muted"
              id={`${nameId}-private-description`}
            >
              {t(
                "workspace.pages.OrgSettingsPage.ad77d0ac",
                "제한된 Slack 멤버만 참여를 허용합니다."
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
