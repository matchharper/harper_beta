"use client";

import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";

export function CareerCallIdlePrompt({
  compact = false,
  onContinue,
}: {
  compact?: boolean;
  onContinue: () => void;
}) {
  const t = useCareerT();

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 rounded-xl border border-neutral-1000-a10 bg-bg-floating px-4 py-3 text-neutral-primary shadow-sm",
        compact ? "mx-4 mb-2" : "w-full max-w-sm"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {t("career.call.idle_prompt.title", "통화를 계속하시겠어요?")}
        </p>
        <p className="mt-0.5 text-xs text-neutral-muted">
          {t(
            "career.call.idle_prompt.description",
            "3분 안에 응답이 없으면 통화가 종료됩니다."
          )}
        </p>
      </div>
      <MuteButton type="button" size="sm" variant="dark" onClick={onContinue}>
        {t("career.call.idle_prompt.continue", "계속 통화")}
      </MuteButton>
    </div>
  );
}
