import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { Hash, Lock, Plus } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { OrgActionPicker } from "./OrgActionPicker";
import type { OrgSlackChannel } from "@/hooks/org/useOrgSlack";

type Channel = Pick<OrgSlackChannel, "channelId" | "channelName" | "isPrivate">;

export function OrgSlackChannelPicker({
  channels,
  disabled = false,
  pendingChannelId,
  refreshing = false,
  onInvite,
  onCreate,
  onRefresh,
}: {
  channels: readonly Channel[];
  disabled?: boolean;
  pendingChannelId?: string | null;
  refreshing?: boolean;
  onInvite: (channelId: string) => void;
  onCreate?: () => void;
  onRefresh: () => void;
}) {
  const { c } = useOrgLocale();
  return (
    <OrgActionPicker
      items={channels.map((channel) => {
        const name = channel.channelName || channel.channelId;
        const Icon = channel.isPrivate ? Lock : Hash;
        return {
          id: channel.channelId,
          name,
          icon: (
            <Icon
              className="size-3.5 shrink-0 text-neutral-muted"
              aria-hidden="true"
            />
          ),
          label: (
            <>
              {channel.isPrivate ? (
                <span className="sr-only">
                  {c("비공개 채널 {name}", "Private channel {name}", { name })}
                </span>
              ) : null}
              <span aria-hidden={channel.isPrivate}>{name}</span>
            </>
          ),
          actionLabel: c("{name}에 Harper 초대", "Invite Harper to {name}", {
            name,
          }),
        };
      })}
      searchLabel={c("채널 검색", "Search channels")}
      listLabel={c("초대할 Slack 채널", "Channel to connect")}
      refreshLabel={c("채널 목록 새로고침", "Refresh channel list")}
      emptyMessage={c(
        "초대할 수 있는 채널이 없어요.",
        "No channels available to connect."
      )}
      noMatchMessage={c("일치하는 채널이 없어요.", "No matching channels.")}
      normalizeSearch={(value) => value.replace(/^#/, "")}
      disabled={disabled}
      pendingId={pendingChannelId}
      refreshing={refreshing}
      onSelect={onInvite}
      onRefresh={onRefresh}
    >
      {onCreate ? (
        <div className="flex shrink-0 pt-1">
          <MuteButton
            variant="primary"
            size="sm"
            onClick={onCreate}
            disabled={disabled || Boolean(pendingChannelId)}
          >
            <Plus className="size-3.5" />
            {c("새 채널 만들기", "Create new channel")}
          </MuteButton>
        </div>
      ) : null}
    </OrgActionPicker>
  );
}
