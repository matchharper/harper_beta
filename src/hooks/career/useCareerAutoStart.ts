import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import type { User } from "@supabase/supabase-js";
import type { CareerCallStartRequest } from "@/components/career/types";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";

type AutoStartArgs = {
  user: User | null;
  forceOnboardingStart?: boolean;
  onboardingBeginPending: boolean;
  showVoiceStartPrompt: boolean;
  onStartCallMode?: (
    args?: CareerCallStartRequest
  ) => boolean | Promise<boolean>;
  onUseChatOnly: () => boolean | Promise<boolean> | void;
  onContinueOnboardingConversation?: () =>
    | boolean
    | Promise<boolean>
    | Promise<void>
    | void;
};

export function useCareerAutoStart({
  user,
  forceOnboardingStart = false,
  onboardingBeginPending,
  showVoiceStartPrompt,
  onStartCallMode,
  onUseChatOnly,
  onContinueOnboardingConversation,
}: AutoStartArgs) {
  const router = useRouter();
  const handledRef = useRef(false);

  const clearStartQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("start");
    nextUrl.searchParams.delete("starter");
    nextUrl.searchParams.delete("source");
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
    if (!user || onboardingBeginPending) return;

    const startMode =
      router.query.start === "call" || router.query.start === "chat"
        ? router.query.start
        : null;
    const rawStarterId = Array.isArray(router.query.starter)
      ? router.query.starter[0]
      : router.query.starter;
    const conversationStarter = getCareerConversationStarter(
      rawStarterId,
      router.locale
    );
    if (!startMode) return;
    if (
      !showVoiceStartPrompt &&
      !forceOnboardingStart &&
      !conversationStarter
    ) {
      return;
    }

    handledRef.current = true;
    clearStartQuery();

    if (startMode === "call" && onStartCallMode) {
      void onStartCallMode(
        conversationStarter
          ? {
              conversationStarterId: conversationStarter.id,
              openingText: conversationStarter.callOpeningText,
            }
          : forceOnboardingStart && !showVoiceStartPrompt
          ? { forceBeginOnboarding: true }
          : undefined
      );
      return;
    }

    if (
      forceOnboardingStart &&
      !showVoiceStartPrompt &&
      onContinueOnboardingConversation
    ) {
      void onContinueOnboardingConversation();
      return;
    }

    void onUseChatOnly();
  }, [
    clearStartQuery,
    forceOnboardingStart,
    onboardingBeginPending,
    onContinueOnboardingConversation,
    onStartCallMode,
    onUseChatOnly,
    router.isReady,
    router.locale,
    router.query.start,
    router.query.starter,
    showVoiceStartPrompt,
    user,
  ]);
}
