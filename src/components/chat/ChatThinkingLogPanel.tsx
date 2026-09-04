import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Loader2,
  Pencil,
  Play,
  ScanSearch,
  Send,
} from "lucide-react";
import { memo, useState } from "react";

import { BareButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatThinkingLogEntry = {
  id?: string;
  icon?: "read" | "write" | "send" | "run" | "search" | "link";
  label: string;
  status?: "done" | "error" | "running";
};

export type ChatThinkingLogPanelProps = {
  active?: boolean;
  className?: string;
  logs: Array<string | ChatThinkingLogEntry>;
  typographyClassName?: string;
};

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
  logs,
  typographyClassName,
}: ChatThinkingLogPanelProps) {
  const [expanded, setExpanded] = useState(active);
  const isExpanded = active || expanded;

  if (logs.length === 0) return null;

  return (
    <div
      className={cn(
        "flex w-full max-w-[760px] flex-col gap-2 text-neutral-muted",
        typographyClassName,
        className
      )}
      aria-live={active ? "polite" : undefined}
    >
      <BareButton
        type="button"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={isExpanded}
        className={cn(
          "inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-[8px] py-1 font-medium text-neutral-muted transition-colors hover:text-neutral-muted",
          typographyClassName
        )}
      >
        {active ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-soft" />
        ) : isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-neutral-soft" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-neutral-soft" />
        )}
        <span>Thinking</span>
      </BareButton>
      {isExpanded ? (
        <div className="ml-[7px] border-l border-neutral-1000-a05 pl-4">
          <ol className="flex flex-col gap-1.5">
            {logs.map((log, index) => {
              const entry: ChatThinkingLogEntry =
                typeof log === "string" ? { label: log } : log;
              return (
                <li
                  key={entry.id || `${index}-${entry.label}`}
                  className={cn(
                    "wrap-break-word flex items-start gap-2 text-neutral-muted",
                    typographyClassName
                  )}
                >
                  {entry.status ? (
                    <ThinkingLogStatusIcon
                      icon={entry.icon}
                      status={entry.status}
                    />
                  ) : null}
                  <span>{entry.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
});
