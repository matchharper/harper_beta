import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, MapPin } from "lucide-react";
import Head from "next/head";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MuteButton } from "@/components/ui/button";
import { readPendingGtmInvite } from "@/hooks/career/useGtmInviteClaim";
import { useMessages } from "@/i18n/useMessage";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { gtmInviteFirstScreenSeenKey, type GtmInviteFirstScreen as Posting } from "@/lib/gtmPlays/inviteFirstScreen";

const COPY = {
  ko: { start: "이 공고로 시작하기", next: "프로필을 만들면 이 공고에 맞춰 바로 이어 드려요" },
  en: { start: "Continue with this role", next: "Set up your profile and we’ll pick up with this role right away." },
} as const;

function wasSeen(mailId: string) {
  try {
    return window.localStorage.getItem(gtmInviteFirstScreenSeenKey(mailId)) !== null;
  } catch {
    return false;
  }
}

function markSeen(mailId: string) {
  try {
    window.localStorage.setItem(gtmInviteFirstScreenSeenKey(mailId), new Date().toISOString());
  } catch {
    // Storage blocked: the screen may show again on the next visit.
  }
}

/**
 * Where "이 공고로 시작하기" goes: today the existing onboarding (the screen steps aside, once per mail). The
 * one place to change when the shorter onboarding after the posting is decided.
 */
function continueFromGtmInvite(mailId: string, showOnboarding: () => void) {
  markSeen(mailId);
  showOnboarding();
}

const noSubscribe = () => () => undefined;

/** The GTM mail this browser came from whose first screen has not been shown yet (null on the server). */
function useUnseenGtmInvite() {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const mailId = readPendingGtmInvite();
      return mailId && !wasSeen(mailId) ? mailId : null;
    },
    () => null,
  );
}

/** The screen itself: the posting and "이 공고로 시작하기". */
export function GtmInviteFirstScreenView({ posting, onStart }: { posting: Posting; onStart: () => void }) {
  const { locale } = useMessages();
  const copy = COPY[locale === "en" ? "en" : "ko"];
  return (
    <main className="career-onboarding flex min-h-svh flex-col bg-bg-default font-sans text-neutral-primary">
      <Head>
        <title>{`${[posting.companyName, posting.title].filter(Boolean).join(" · ")} | Harper`}</title>
      </Head>
      <header className="flex h-14 items-center px-4 md:px-6">
        <Image src="/svgs/logov2.svg" alt="Harper" width={64} height={29} priority />
      </header>
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-4 pb-16 md:px-6">
        {posting.companyName ? <p className="text-[15px] font-medium">{posting.companyName}</p> : null}
        <h1 className="mt-2 text-[24px] font-medium leading-[1.4] wrap-break-word md:text-[30px]">{posting.title}</h1>
        {posting.location ? (
          <p className="mt-3 inline-flex items-center gap-2 text-[13px] text-neutral-primary/70 md:text-[14px]">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {posting.location}
          </p>
        ) : null}
        {posting.summary ? (
          <p className="mt-6 break-keep text-[15px] leading-7 text-neutral-primary/80">{posting.summary}</p>
        ) : null}
        <div className="mt-10 flex w-full flex-col md:w-fit">
          <MuteButton size="lg" variant="primary" onClick={onStart}>{copy.start}</MuteButton>
          <p className="mt-3 break-keep text-[13px] leading-6 text-neutral-primary/60">{copy.next}</p>
        </div>
      </div>
    </main>
  );
}

/**
 * Onboarding for someone who came from a #4 후보 메일: the posting the mail was about is the first screen, once
 * per mail (remembered in this browser), and its button goes on into onboarding. The posting still goes into the
 * inbox after onboarding, as before. Returns what to render instead of onboarding, or null to go on with it.
 * `active`: onboarding is at its form (not loading or done).
 */
export function useGtmInviteFirstScreen(active: boolean): ReactNode {
  const pendingMailId = useUnseenGtmInvite();
  const [started, setStarted] = useState<string | null>(null);
  const mailId = active && pendingMailId && started !== pendingMailId ? pendingMailId : null;
  const query = useQuery({
    queryKey: ["gtm", "invite-first-screen", mailId ?? ""],
    enabled: Boolean(mailId),
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/gtm/invite-posting?m=${encodeURIComponent(mailId ?? "")}`);
      const payload = (await response.json().catch(() => ({}))) as { posting?: Posting | null };
      return payload.posting ?? null;
    },
  });
  const start = useCallback(() => {
    if (!mailId) return;
    continueFromGtmInvite(mailId, () => {
      setStarted(mailId);
      window.scrollTo({ top: 0 });
    });
  }, [mailId]);
  if (!mailId) return null;
  if (query.isPending) {
    return (
      <main className="career-onboarding flex min-h-svh items-center justify-center text-neutral-primary">
        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-muted" />
      </main>
    );
  }
  // No posting to show (old link, not a candidate mail): straight on with onboarding.
  if (!query.data) return null;
  return <GtmInviteFirstScreenView posting={query.data} onStart={start} />;
}

/**
 * Onboarding for someone who came from a #4 후보 메일 sent from their LinkedIn profile (an external search result
 * or a scraped profile): that profile URL, read on the server for the signed-in person only, goes to `onPrefill`
 * once, so 프로필 연결 starts filled and they only confirm, change or remove it.
 */
export function useGtmInviteLinkedinPrefill(onPrefill: (url: string) => void) {
  const latest = useRef(onPrefill);
  useEffect(() => {
    latest.current = onPrefill;
  });
  useEffect(() => {
    const mailId = readPendingGtmInvite();
    if (!mailId) return;
    let cancelled = false;
    fetchWithInternalAuth<{ linkedinUrl: string | null }>(`/api/gtm/invite-prefill?m=${encodeURIComponent(mailId)}`)
      .then((result) => {
        if (!cancelled && result.linkedinUrl) latest.current(result.linkedinUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
}
