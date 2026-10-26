import { LoaderCircle } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizeOrgAgentThinkingLogs } from "@/lib/org/agent/thinkingLogs";
import type { OrgAgentThinkingLog } from "@/lib/org/agent/types";

/** Opaque replacement for both Setup panes while the first turn writes them. */
export function RoleStartPreparation({
  logs = [],
  error,
  onBack,
}: {
  logs?: OrgAgentThinkingLog[];
  error?: string | null;
  onBack?: () => void;
}) {
  const { c, locale } = useOrgLocale();
  return (
    <div
      className="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto bg-bg-default px-6 py-12"
      data-role-start-preparation
      aria-busy={!error}
    >
      <div className="flex w-full max-w-md flex-col items-center justify-center gap-5 text-center">
        {!error ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 text-base text-neutral-primary"
          >
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            {c("새로운 역할을 준비중입니다", "Preparing your new role")}
          </div>
        ) : null}
        {logs.length > 0 ? (
          <ol
            aria-live="polite"
            className="flex flex-col items-center gap-2 text-sm leading-5 text-neutral-muted"
          >
            {localizeOrgAgentThinkingLogs(logs, locale).map((log, index) => (
              <li
                key={log.id ?? index}
                className={log.status === "error" ? "text-critical" : undefined}
              >
                {log.label}
              </li>
            ))}
          </ol>
        ) : null}
        {error ? (
          <>
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
            {onBack ? (
              <MuteButton onClick={onBack}>{c("이전", "Back")}</MuteButton>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
