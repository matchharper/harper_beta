import { useQueries } from "@tanstack/react-query";
import { BriefcaseBusiness, LoaderCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  orgRoleNotificationSettingsQueryOptions,
  useUpdateOrgRoleNotificationSettings,
} from "@/hooks/org/useOrgRoleNotifications";
import type { OrgSlackChannel } from "@/hooks/org/useOrgSlack";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { ROLE_NOTIFICATION_DESTINATION_REQUIRED } from "@/lib/org/roleNotificationDestinations";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/useToastStore";

export function OrgSlackChannelRolesDialog({
  channel,
  isNewChannel = false,
  onClose,
}: {
  channel: Pick<OrgSlackChannel, "channelId" | "channelName">;
  isNewChannel?: boolean;
  onClose: () => void;
}) {
  const { c, locale } = useOrgLocale();
  const { roles, workspace } = useOrgWorkspace();
  const addToast = useToastStore((state) => state.add);
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateOrgRoleNotificationSettings();
  const settings = useQueries({
    queries: roles.map((role) => ({
      ...orgRoleNotificationSettingsQueryOptions({
        audienceChannelId: channel.channelId,
        roleId: role.roleId,
        workspaceId: workspace.workspaceId,
      }),
      refetchOnMount: "always" as const,
    })),
  });
  const loading = settings.some((query) => query.isPending);
  const loadFailed = settings.some((query) => query.isError);
  const rows = roles.map((role, index) => {
    const channels = settings[index].data?.channels ?? [];
    const current = channels.find(
      (item) => item.channelId === channel.channelId
    );
    const otherChannels = channels.filter(
      (item) => item.enabled && item.channelId !== channel.channelId
    );
    const canAssign = current?.canAssign === true;
    return {
      role,
      current,
      canAssign,
      selected:
        overrides[role.roleId] ??
        (isNewChannel
          ? canAssign && otherChannels.length === 0
          : (current?.enabled ?? false)),
      otherChannels,
    };
  });
  const unavailable = rows.some((row) => !row.current);
  const ready = !loading && !loadFailed && !unavailable;
  const selectedCount = rows.filter((row) => row.selected).length;
  const visibleRows = rows.filter(({ role }) =>
    role.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );
  const channelName = `#${(channel.channelName || channel.channelId).replace(/^#/, "")}`;

  const save = async () => {
    if (savingRef.current || !ready) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setOverrides(
      Object.fromEntries(rows.map((row) => [row.role.roleId, row.selected]))
    );
    let savedCount = 0;
    try {
      // Patch only this channel. Successful rows stay cached if a later request fails.
      for (const row of rows) {
        if (row.selected === row.current?.enabled) continue;
        await update.mutateAsync({
          workspaceId: workspace.workspaceId,
          roleId: row.role.roleId,
          channels: [{ channelId: channel.channelId, enabled: row.selected }],
        });
        savedCount += 1;
      }
      addToast({
        variant: "success",
        message: c(
          "{channel}의 Role 할당을 저장했어요.",
          "Saved role assignments for {channel}.",
          { channel: channelName }
        ),
      });
      onClose();
    } catch (cause) {
      const reason = localizedOrgErrorMessage(
        cause,
        locale,
        c("Role 할당을 완료하지 못했어요.", "Couldn't finish assigning roles.")
      );
      // Nothing was saved when the first change is refused for leaving a role
      // without any destination, so only that reason is true.
      const refusedBeforeAnySave =
        savedCount === 0 &&
        cause instanceof Error &&
        cause.message.trim() === ROLE_NOTIFICATION_DESTINATION_REQUIRED;
      if (refusedBeforeAnySave) {
        setError(reason);
        return;
      }
      setError(
        c(
          "일부 변경이 저장됐을 수 있어요. 선택은 유지되며 다시 저장할 수 있어요.",
          "Some changes may have been saved. Your selection is preserved; you can save again."
        ) +
          " " +
          reason
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <TalentCareerModal
      open
      onClose={() => {
        if (!savingRef.current) onClose();
      }}
      mobileBottomSheet
      closeOnBackdrop={!saving}
      showCloseButton={!saving}
      panelClassName="max-w-lg"
      bodyClassName="space-y-4 px-4 sm:px-5"
      title={c(
        "이 채널에 어떤 Role을 할당할까요?",
        "Which Roles would you like to assign to this channel?"
      )}
      footer={
        <div className="flex justify-end gap-2">
          <MuteButton disabled={saving} onClick={onClose}>
            {c("닫기", "Close")}
          </MuteButton>
          <MuteButton
            variant="dark"
            disabled={saving || !ready || roles.length === 0}
            onClick={() => void save()}
          >
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <></>}
            {saving ? c("저장 중", "Saving") : c("저장하기", "Save")}
          </MuteButton>
        </div>
      }
    >
      {loading ? (
        <div
          role="status"
          aria-label={c("Role 불러오는 중", "Loading roles")}
          className="space-y-2"
        >
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : loadFailed || unavailable ? (
        <div role="alert" className="space-y-3 text-sm text-neutral-muted">
          <p>
            {c(
              "Role의 채널 설정을 불러오지 못했어요.",
              "Couldn't load channel settings for your roles."
            )}
          </p>
          <MuteButton
            onClick={() => {
              void Promise.all(settings.map((query) => query.refetch()));
            }}
          >
            {c("다시 불러오기", "Try again")}
          </MuteButton>
        </div>
      ) : roles.length === 0 ? (
        <div className="py-8 text-center">
          <BriefcaseBusiness
            aria-hidden="true"
            className="mx-auto mb-3 size-6 text-neutral-soft"
          />
          <p className="text-sm text-neutral-primary">
            {c("아직 등록된 Role이 없어요", "No roles yet")}
          </p>
          <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
            {c(
              "채널은 연결됐어요. Role을 만든 뒤 Role 설정에서 알림 채널을 선택할 수 있어요.",
              "Your channel is connected. Once you create a role, choose its notification channels in role settings."
            )}
          </p>
        </div>
      ) : (
        <>
          <div>
            <label className="sr-only" htmlFor={searchId}>
              {c("Role 검색", "Search roles")}
            </label>
            <Input
              id={searchId}
              type="search"
              placeholder={c("Role 검색", "Search roles")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-[12px] text-neutral-muted">
            {c("{count}개 선택", "{count} selected", {
              count: selectedCount,
            })}
          </div>
          <div className="max-h-[244px] min-h-[76px] -mt-2 space-y-0.5 rounded-xl border border-neutral-1000-a05 px-2 py-1 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10 [scrollbar-gutter:stable]">
            {visibleRows.map(({ role, selected, otherChannels, canAssign }) => (
              <label
                key={role.roleId}
                className={cn(
                  "flex cursor-pointer items-center gap-2 border-b border-neutral-1000-a05 px-1 py-2 transition-colors",
                  !canAssign && "cursor-not-allowed opacity-60",
                  saving && "cursor-wait opacity-60"
                )}
              >
                <BriefcaseBusiness
                  aria-hidden="true"
                  className={cn("size-3.5 shrink-0")}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block break-words text-[13px]",
                      selected ? "text-neutral-primary" : "text-neutral-muted"
                    )}
                  >
                    {role.name}
                  </span>
                  {!canAssign ? (
                    <span className="mt-1 block text-xs leading-5 text-neutral-muted">
                      {c(
                        "채널 참여자의 Role 접근 권한을 확인하지 못해 선택할 수 없어요.",
                        "Unavailable because channel participants' access to this role couldn't be verified."
                      )}
                    </span>
                  ) : null}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "break-words text-xs",
                      selected ? "text-positive" : "text-neutral-muted"
                    )}
                  >
                    {selected
                      ? c("현재 채널에 할당", "Assigned to this channel")
                      : otherChannels.length > 0
                        ? c("다른 채널에 연결됨", "Connected to other channels")
                        : c("할당된 채널 없음", "No channels assigned")}
                  </span>
                  <Checkbox
                    aria-label={role.name}
                    checked={selected}
                    disabled={!canAssign || saving}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setOverrides((current) => ({
                        ...current,
                        [role.roleId]: checked,
                      }));
                    }}
                  />
                </div>
              </label>
            ))}
            {visibleRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-muted">
                {c("검색 결과가 없어요.", "No matching roles.")}
              </p>
            ) : null}
          </div>
        </>
      )}
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-critical-faded px-3 py-3 text-[13px] leading-5 text-critical"
        >
          {error}
        </p>
      ) : null}
    </TalentCareerModal>
  );
}
