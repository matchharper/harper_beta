import {
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Loader2,
  Pencil,
  Play,
  ScanSearch,
  Send,
} from "lucide-react";
import { memo, useEffect, useState, type ReactNode } from "react";

import { BareButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatThinkingLogEntry = {
  id?: string;
  icon?: "read" | "write" | "send" | "run" | "search" | "link";
  label: string;
  content?: ReactNode;
  status?: "done" | "error" | "running";
};

export type ChatThinkingLogPanelProps = {
  active?: boolean;
  className?: string;
  completedAt?: string;
  hasToolWork?: boolean;
  statusLabel?: string;
  logs: Array<string | ChatThinkingLogEntry>;
  /** While active, show only the current step on one line; the list opens on click. */
  liveLine?: boolean;
  startedAt?: string;
};

export function formatChatWorkDuration(
  startedAt?: string,
  completedAt?: string
) {
  if (!startedAt || !completedAt) return null;
  const startedTime = new Date(startedAt).getTime();
  const completedTime = new Date(completedAt).getTime();
  if (
    !Number.isFinite(startedTime) ||
    !Number.isFinite(completedTime) ||
    completedTime < startedTime
  ) {
    return null;
  }

  const totalSeconds = Math.max(
    0,
    Math.round((completedTime - startedTime) / 1000)
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours > 0 ? `${hours}h` : null,
    minutes > 0 || hours > 0 ? `${minutes}m` : null,
    `${seconds}s`,
  ]
    .filter(Boolean)
    .join(" ");
}

function ThinkingLogStatusIcon({
  icon,
  status,
}: {
  icon?: ChatThinkingLogEntry["icon"];
  status: "done" | "error" | "running";
}) {
  if (status === "running") {
    return (
      <Loader2
        aria-hidden="true"
        className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-neutral-soft"
      />
    );
  }
  if (status === "error") {
    return (
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-muted"
      />
    );
  }
  const Icon =
    icon === "search"
      ? ScanSearch
      : icon === "link"
        ? ExternalLink
        : icon === "read"
          ? BookOpen
          : icon === "write"
            ? Pencil
            : icon === "send"
              ? Send
              : icon === "run"
                ? Play
                : Check;
  return (
    <Icon
      aria-hidden="true"
      className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-soft"
    />
  );
}

export const ChatThinkingLogPanel = memo(function ChatThinkingLogPanel({
  active = false,
  className,
  completedAt,
  hasToolWork = true,
  liveLine = false,
  logs,
  startedAt,
  statusLabel: statusLabelOverride,
}: ChatThinkingLogPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const live = active && liveLine;
  const isExpanded = live ? expanded : active || expanded;
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    if (!active || !startedAt) return;
    setNow(new Date().toISOString());
    const timer = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(timer);
  }, [active, startedAt]);
  const duration = formatChatWorkDuration(startedAt, active ? now : completedAt);
  const statusLabel =
    statusLabelOverride ??
    (hasToolWork ? (active ? "Working" : "Worked") : "Thinking");

  if (logs.length === 0 && !startedAt && !active) return null;
  const entries: ChatThinkingLogEntry[] = logs.map((log) =>
    typeof log === "string" ? { label: log } : log
  );
  const current = live ? entries.at(-1) : undefined;

  return (
    <div
      className={cn(
        "flex w-full max-w-[760px] flex-col gap-2 text-neutral-muted text-sm leading-6",
        className
      )}
      aria-live={active ? "polite" : undefined}
    >
      <BareButton
        disabled={logs.length === 0}
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={logs.length > 0 ? isExpanded : undefined}
        className={cn(
          "inline-flex w-fit items-center gap-1.5 cursor-default rounded-md py-1 font-normal text-neutral-soft transition-colors hover:text-neutral-900",
          live && "min-w-0 max-w-full gap-2"
        )}
      >
        {live ? (
          <>
            <span aria-hidden="true" className="chat-live-dots">
              <span />
              <span />
              <span />
            </span>
            <span className="min-w-0 overflow-hidden">
              <span
                key={current ? `${entries.length}:${current.label}` : "idle"}
                className="chat-live-step"
              >
                <span className="career-thinking-shimmer block truncate">
                  {current ? current.label.replace(/\s+/g, " ") : statusLabel}
                </span>
              </span>
            </span>
            {duration && (
              <span className="shrink-0 tabular-nums text-neutral-soft">
                {duration}
              </span>
            )}
          </>
        ) : (
          <>
            {active ? <Loader2 className="h-4 w-4 animate-spin" /> : <></>}
            <span>
              {statusLabel}
              {duration ? ` for ${duration}` : ""}
            </span>
          </>
        )}
        {logs.length > 0 && (
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              isExpanded ? "rotate-90" : ""
            )}
            strokeWidth={1.6}
          />
        )}
      </BareButton>
      {
        <div hidden={!isExpanded || logs.length === 0} className="mb-2">
          <ol className="flex flex-col gap-1.5">
            {entries.map((entry, index) => {
              return (
                <li
                  key={entry.id ?? index}
                  className={cn(
                    "wrap-break-word flex items-start gap-2 text-neutral-muted"
                  )}
                >
                  {entry.status ? (
                    <ThinkingLogStatusIcon
                      icon={entry.icon}
                      status={entry.status}
                    />
                  ) : null}
                  {entry.content ?? <span>{entry.label}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      }
    </div>
  );
});
