import { useOrgT } from "@/i18n/org/OrgLocaleProvider";
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
  const t = useOrgT();
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
          {t("OrgSlackChannelPicker.f510275a", "채널 검색")}
        </label>
        <Input
          id={searchId}
          type="search"
          autoComplete="off"
          placeholder={t("OrgSlackChannelPicker.f510275a", "채널 검색")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-0 flex-1"
        />
        <MuteButton
          variant="transparent"
          size="sm"
          aria-label={t("OrgSlackChannelPicker.26e32c5c", "채널 목록 새로고침")}
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
            aria-label={t("OrgSlackChannelPicker.62fbda7c", "초대할 Slack 채널")}
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
                        {t("composed.privateChannel", "비공개 채널 {name}", { name })}
                      </span>
                    ) : null}
                    <span aria-hidden={channel.isPrivate}>{name}</span>
                  </span>
                  <MuteButton
                    variant="dark"
                    size="sm"
                    disabled={busy}
                    aria-label={t("OrgSlackChannelPicker.2842bef6", "{p0}에 Harper 초대", {
                      p0: name,
                    })}
                    onClick={() => onInvite(channel.channelId)}
                    className="shrink-0"
                  >
                    {pending ? (
                      <LoaderCircle
                        className="size-3 animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    {pending
                      ? t("OrgSlackChannelPicker.3d6eafd2", "초대 중")
                      : t("OrgSlackChannelPicker.a35bd973", "초대")}
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
              ? t("OrgSlackChannelPicker.c202e21b", "일치하는 채널이 없어요.")
              : t("OrgSlackChannelPicker.239c8b40", "초대할 수 있는 채널이 없어요.")}
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
            {t("OrgSlackChannelPicker.f9c0c08b", "새 채널 만들기")}
          </MuteButton>
        </div>
      ) : null}
    </div>
  );
}
