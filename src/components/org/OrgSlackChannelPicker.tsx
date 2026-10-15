import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useId, useState } from "react";
import { Hash, LoaderCircle, Lock, Plus, RefreshCw } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrgSlackChannel } from "@/hooks/org/useOrgSlack";

type Channel = Pick<OrgSlackChannel, "channelId" | "channelName" | "isPrivate">;

export const ORG_SLACK_PRIVATE_CHANNEL_HELP = [
  "비공개 채널이 보이지 않나요?",
  "Slack의 해당 채널에서 /invite @Harper를 입력한 뒤 아래의 새로고침 버튼을 눌러 주세요.",
] as const;

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
  const searchId = useId();
  const [search, setSearch] = useState("");
  const query = search.trim().replace(/^#/, "").toLocaleLowerCase();
  const visibleChannels = channels.filter((channel) =>
    (channel.channelName || channel.channelId)
      .toLocaleLowerCase()
      .includes(query)
  );
  const busy = disabled || Boolean(pendingChannelId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <label className="sr-only" htmlFor={searchId}>
          {c("채널 검색", "Search channels")}
        </label>
        <Input
          id={searchId}
          type="search"
          autoComplete="off"
          placeholder={c("채널 검색", "Search channels")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-0 flex-1"
        />
        <MuteButton
          variant="transparent"
          size="sm"
          aria-label={c("채널 목록 새로고침", "Refresh channel list")}
          disabled={busy || refreshing}
          onClick={onRefresh}
          className="shrink-0"
        >
          <RefreshCw
            className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
        </MuteButton>
      </div>
      <div className="max-h-[378px] min-h-[76px] overflow-y-auto overscroll-contain scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10 [scrollbar-gutter:stable]">
        {visibleChannels.length ? (
          <ul
            aria-label={c("초대할 Slack 채널", "Slack channel to invite")}
            className="space-y-0.5"
          >
            {visibleChannels.map((channel) => {
              const name = channel.channelName || channel.channelId;
              const pending = pendingChannelId === channel.channelId;
              const Icon = channel.isPrivate ? Lock : Hash;
              return (
                <li
                  key={channel.channelId}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-bg-floating"
                >
                  <Icon
                    className="size-3.5 shrink-0 text-neutral-soft"
                    aria-hidden="true"
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-[13px] text-neutral-primary"
                    title={name}
                  >
                    {channel.isPrivate ? (
                      <span className="sr-only">
                        {c("비공개 채널 {name}", "Private channel {name}", {
                          name,
                        })}
                      </span>
                    ) : null}
                    <span aria-hidden={channel.isPrivate}>{name}</span>
                  </span>
                  <MuteButton
                    variant="dark"
                    size="sm"
                    disabled={busy}
                    aria-label={c(
                      "{p0}에 Harper 초대",
                      "Invite Harper to {p0}",
                      {
                        p0: name,
                      }
                    )}
                    onClick={() => onInvite(channel.channelId)}
                    className="shrink-0"
                  >
                    {pending ? (
                      <LoaderCircle
                        className="size-3 animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    {pending ? c("초대 중", "Inviting") : c("초대", "Invite")}
                  </MuteButton>
                </li>
              );
            })}
          </ul>
        ) : (
          <p
            role="status"
            className="px-2 py-7 text-center text-[13px] text-neutral-soft"
          >
            {query
              ? c("일치하는 채널이 없어요.", "No matching channels.")
              : c(
                  "초대할 수 있는 채널이 없어요.",
                  "No channels available to invite."
                )}
          </p>
        )}
      </div>
      {onCreate ? (
        <div className="flex shrink-0 pt-1">
          <MuteButton
            variant="primary"
            size="sm"
            onClick={onCreate}
            disabled={busy}
          >
            <Plus className="size-3.5" />
            {c("새 채널 만들기", "Create new channel")}
          </MuteButton>
        </div>
      ) : null}
    </div>
  );
}
