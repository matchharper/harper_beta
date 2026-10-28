import { useId, useState, type ReactNode } from "react";
import { LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type OrgActionPickerItem = {
  id: string;
  name: string;
  icon: ReactNode;
  label?: ReactNode;
  actionLabel: string;
};

/** Shared compact search/list/action layout for Slack channels and slot Roles. */
export function OrgActionPicker({
  items,
  searchLabel,
  listLabel,
  refreshLabel,
  emptyMessage,
  noMatchMessage,
  disabled = false,
  pendingId,
  refreshing = false,
  normalizeSearch = (value) => value,
  onSelect,
  onRefresh,
  children,
}: {
  items: readonly OrgActionPickerItem[];
  searchLabel: string;
  listLabel: string;
  refreshLabel: string;
  emptyMessage: string;
  noMatchMessage: string;
  disabled?: boolean;
  pendingId?: string | null;
  refreshing?: boolean;
  normalizeSearch?: (value: string) => string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  children?: ReactNode;
}) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const query = normalizeSearch(search.trim()).toLocaleLowerCase();
  const visible = items.filter((item) =>
    item.name.toLocaleLowerCase().includes(query)
  );
  const busy = disabled || Boolean(pendingId);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <label className="sr-only" htmlFor={searchId}>
          {searchLabel}
        </label>
        <Input
          id={searchId}
          type="search"
          autoComplete="off"
          placeholder={searchLabel}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-0 flex-1"
        />
        <MuteButton
          size="sm"
          aria-label={refreshLabel}
          disabled={busy || refreshing}
          onClick={onRefresh}
          className="shrink-0"
        >
          <RefreshCw
            className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
        </MuteButton>
      </div>
      <div className="max-h-[244px] min-h-[76px] rounded-xl px-2 border border-neutral-1000-a05 py-1 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10 [scrollbar-gutter:stable]">
        {visible.length ? (
          <ul aria-label={listLabel} className="space-y-0.5">
            {visible.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 pl-1 py-1.5 hover:bg-bg-floating border-b border-neutral-1000-a05"
              >
                {item.icon}
                <span
                  className="min-w-0 flex-1 truncate text-[13px] text-neutral-muted"
                  title={item.name}
                >
                  {item.label ?? item.name}
                </span>
                <MuteButton
                  variant="neutral"
                  size="sm"
                  disabled={busy}
                  onClick={() => onSelect(item.id)}
                  aria-label={item.actionLabel}
                  className="shrink-0"
                >
                  {pendingId === item.id ? (
                    <LoaderCircle
                      className="size-3 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Plus className="size-3.5" aria-hidden="true" />
                  )}
                </MuteButton>
              </li>
            ))}
          </ul>
        ) : (
          <p
            role="status"
            className="px-2 py-7 text-center text-[13px] text-neutral-soft"
          >
            {query ? noMatchMessage : emptyMessage}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
