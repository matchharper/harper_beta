import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import type { User } from "@supabase/supabase-js";
import type { CareerCallStartRequest } from "@/components/career/types";

type AutoStartArgs = {
  user: User | null;
  onboardingBeginPending: boolean;
  showVoiceStartPrompt: boolean;
  onStartCallMode?: (
    args?: CareerCallStartRequest
  ) => boolean | Promise<boolean>;
  onUseChatOnly: () => boolean | Promise<boolean> | void;
};

export function useCareerAutoStart({
  user,
  onboardingBeginPending,
  showVoiceStartPrompt,
  onStartCallMode,
  onUseChatOnly,
}: AutoStartArgs) {
  const router = useRouter();
  const handledRef = useRef(false);

  const clearStartQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("start");
    const nextPathname =
      nextUrl.pathname.replace(/\/+$/, "") === "/career/chat"
        ? "/career"
        : nextUrl.pathname;
    void router.replace(`${nextPathname}${nextUrl.search}`, undefined, {
      shallow: true,
    });
  }, [router]);

  useEffect(() => {
    if (!router.isReady || handledRef.current) return;
    if (!user || onboardingBeginPending || !showVoiceStartPrompt) return;

    const startMode =
      router.query.start === "call" || router.query.start === "chat"
        ? router.query.start
        : null;
    if (!startMode) return;

    handledRef.current = true;
    clearStartQuery();

    if (startMode === "call" && onStartCallMode) {
      void onStartCallMode();
      return;
    }

    void onUseChatOnly();
  }, [
    clearStartQuery,
    onboardingBeginPending,
    onStartCallMode,
    onUseChatOnly,
    router.isReady,
    router.query.start,
    showVoiceStartPrompt,
    user,
  ]);
}
