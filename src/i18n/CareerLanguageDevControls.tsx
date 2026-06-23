"use client";

import { useCallback, useState } from "react";
import {
  Database,
  Languages,
  Loader2,
  MousePointer2,
  RefreshCw,
} from "lucide-react";
import { useCareerTranslationInspect } from "@/i18n/CareerTranslationInspectProvider";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

const OPTIONS: Locale[] = ["ko", "en"];

export default function CareerLanguageDevControls({
  className,
}: {
  className?: string;
}) {
  const { locale, setLocale } = useMessages();
  const translationInspect = useCareerTranslationInspect();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const dbPreviewError = translationInspect?.dbPreviewError ?? "";

  const persistPreferredLocale = useCallback(
    async (nextLocale: Locale) => {
      if (authLoading || !user) return;

      setPendingLocale(nextLocale);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const response = await fetch("/api/talent/settings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ preferredLocale: nextLocale }),
        });

        if (!response.ok) {
          console.warn(
            "[CareerLanguageDevControls] Failed to persist preferred locale",
            await response.text().catch(() => "")
          );
        }
      } catch (error) {
        console.warn(
          "[CareerLanguageDevControls] Failed to persist preferred locale",
          error
        );
      } finally {
        setPendingLocale((current) =>
          current === nextLocale ? null : current
        );
      }
    },
    [authLoading, user]
  );

  const handleLocaleChange = useCallback(
    (nextLocale: Locale) => {
      setLocale(nextLocale);
      void persistPreferredLocale(nextLocale);
    },
    [persistPreferredLocale, setLocale]
  );

  if (
    process.env.NODE_ENV === "production" &&
    !translationInspect?.canInspect
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-[140] hidden items-center gap-1 rounded-lg border border-neutral-1000-a10 bg-bg-floating/95 p-1 text-xs shadow-[0_16px_48px_color-mix(in_srgb,var(--color-neutral-1000)_14%,transparent)] backdrop-blur md:flex",
        className
      )}
      data-career-i18n-skip="true"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-bg-weak text-neutral-muted">
        <Languages className="h-3.5 w-3.5" />
      </div>
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => handleLocaleChange(option)}
          className={cn(
            "h-7 rounded-md px-2.5 font-medium uppercase transition",
            locale === option
              ? "bg-black text-neutral-00"
              : "text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary",
            pendingLocale === option && "opacity-60"
          )}
        >
          {option}
        </button>
      ))}
      {translationInspect?.canInspect ? (
        <button
          type="button"
          onClick={() =>
            translationInspect.setDbPreviewEnabled(
              !translationInspect.dbPreviewEnabled
            )
          }
          title={
            dbPreviewError
              ? dbPreviewError
              : translationInspect.dbPreviewEnabled
                ? "DB 번역 검수 끄기"
                : "DB 번역 검수 켜기"
          }
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium transition",
            dbPreviewError
              ? "bg-critical text-neutral-00"
              : translationInspect.dbPreviewEnabled
                ? "bg-black text-neutral-00"
                : "text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary",
            translationInspect.dbPreviewLoading && "opacity-70"
          )}
        >
          {translationInspect.dbPreviewLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Database className="h-3.5 w-3.5" />
          )}
          검수
        </button>
      ) : null}
      {translationInspect?.canInspect && translationInspect.dbPreviewEnabled ? (
        <button
          type="button"
          onClick={() => void translationInspect.refreshDbPreview()}
          disabled={translationInspect.dbPreviewLoading}
          title={
            translationInspect.dbPreviewUpdatedAt
              ? `DB 번역 다시 반영: ${new Date(
                  translationInspect.dbPreviewUpdatedAt
                ).toLocaleTimeString("ko-KR")}`
              : "DB 번역 다시 반영"
          }
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          <RefreshCw
            className={cn(
              "h-3.5 w-3.5",
              translationInspect.dbPreviewLoading && "animate-spin"
            )}
          />
          반영
        </button>
      ) : null}
      {translationInspect?.canInspect ? (
        <button
          type="button"
          onClick={() =>
            translationInspect.setInspectEnabled(
              !translationInspect.inspectEnabled
            )
          }
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium transition",
            translationInspect.inspectEnabled
              ? "bg-black text-neutral-00"
              : "text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary"
          )}
        >
          <MousePointer2 className="h-3.5 w-3.5" />
          Inspect
        </button>
      ) : null}
    </div>
  );
}
