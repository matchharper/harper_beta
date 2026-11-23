import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import Head from "next/head";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MuteButton } from "@/components/ui/button";
import { FaceLoading } from "@/components/ui/face-loading";
import { readPendingGtmInvite } from "@/hooks/career/useGtmInviteClaim";
import { useMessages } from "@/i18n/useMessage";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { SignupLanding } from "@/lib/gtmPlays/agent/signupMove";
import { gtmInviteFirstScreenSeenKey, type GtmInviteFirstScreen as Posting } from "@/lib/gtmPlays/inviteFirstScreen";

const COPY = {
  ko: {
    start: "이 공고로 시작하기",
    startMany: "이 공고들로 시작하기",
    many: (count: number) => `맞을 것 같은 회사 ${count}곳이에요`,
    next: "LinkedIn 주소나 이력서만 넣으면 바로 내 기회에서 볼 수 있어요. 5분 대화는 나중에 원하실 때 해도 돼요.",
    /** The short onboarding's button for a coaching mail (상담 먼저: it ends in Harper's chat). */
    coachingNext: "상담 시작하기",
    /** …and for a general mail of events only (it ends on Harper's home, with the events). */
    eventsNext: "하퍼에서 행사 보기",
  },
  en: {
    start: "Continue with this role",
    startMany: "Continue with these roles",
    many: (count: number) => `${count} companies that may fit you`,
    next: "Add your LinkedIn or resume and they’ll be in My opportunities right away. The 5-minute chat can wait until you want it.",
    coachingNext: "Start with career help",
    eventsNext: "See the events on Harper",
  },
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
 * Where "이 공고로 시작하기" goes: the onboarding page, which for someone who came from a GTM mail is the short one
 * (LinkedIn or resume only, then 내 기회; useGtmShortOnboarding). The screen steps aside, once per mail.
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

/**
 * Someone who came from a GTM mail (the id kept through sign-up): their onboarding is the short one (Shaun 11/17):
 * LinkedIn (filled from the mail when we know it) or a resume only, then straight to 내 기회 with the mail's postings;
 * the 5-minute conversation is offered there, never required. Null for everyone else (and on the server).
 */
export function useGtmShortOnboarding(): string | null {
  return useSyncExternalStore(noSubscribe, () => readPendingGtmInvite(), () => null);
}

type InviteStart = { posting: Posting | null; landing: SignupLanding };

/** The mail's first screen and where its short onboarding ends (one request, shared by both hooks below). */
function useInviteStart(mailId: string | null) {
  return useQuery({
    queryKey: ["gtm", "invite-first-screen", mailId ?? ""],
    enabled: Boolean(mailId),
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<InviteStart> => {
      const response = await fetch(`/api/gtm/invite-posting?m=${encodeURIComponent(mailId ?? "")}`);
      const payload = (await response.json().catch(() => ({}))) as { posting?: Posting | null; landing?: string };
      const landing: SignupLanding = payload.landing === "chat" || payload.landing === "events" ? payload.landing : "opportunities";
      return { posting: payload.posting ?? null, landing };
    },
  });
}

/**
 * Where the short onboarding ends for the GTM mail this browser came from (Shaun 11/23): "chat" for a coaching mail
 * (상담 먼저: career help in Harper's chat), "events" for a general mail of events only (Harper's home, with them),
 * "opportunities" for every other mail (내 기회, as before); undefined while
 * it is being read, and null when there is no mail.
 */
export function useGtmInviteLanding(): SignupLanding | null | undefined {
  const mailId = useGtmShortOnboarding();
  const query = useInviteStart(mailId);
  if (!mailId) return null;
  if (query.isPending) return undefined;
  return query.data?.landing ?? "opportunities";
}

/** The short onboarding's button for a mail that lands in the chat or on its events; null to keep its usual one (내 기회에서 공고 보기). */
export function gtmInviteNextLabel(landing: SignupLanding | null | undefined, locale: string): string | null {
  const copy = COPY[locale === "en" ? "en" : "ko"];
  return landing === "chat" ? copy.coachingNext : landing === "events" ? copy.eventsNext : null;
}

/** The mail's 2-3 postings as a list (company · title · place, and why each fits). */
function PostingList({ postings }: { postings: Posting["postings"] }) {
  return (
    <ul className="mt-6 space-y-3">
      {postings.map((item) => (
        <li key={`${item.companyName}|${item.title}`} className="rounded-sm border border-beige900/10 bg-bg-floating/35 p-4 md:p-5">
          {item.companyName ? <p className="text-[14px] font-medium">{item.companyName}</p> : null}
          <p className="mt-1 text-[16px] leading-[1.5] wrap-break-word">{item.title}</p>
          {item.location ? (
            <p className="mt-1.5 inline-flex items-center gap-2 text-[13px] text-neutral-primary/70">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {item.location}
            </p>
          ) : null}
          {item.summary ? <p className="mt-2 break-keep text-[14px] leading-6 text-neutral-primary/80">{item.summary}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** The screen itself: the posting (or the mail's 2-3 postings) and "이 공고로 시작하기". */
export function GtmInviteFirstScreenView({ posting, onStart }: { posting: Posting; onStart: () => void }) {
  const { locale } = useMessages();
  const copy = COPY[locale === "en" ? "en" : "ko"];
  const many = (posting.postings?.length ?? 0) > 1;
  if (many) {
    return (
      <main className="career-onboarding flex min-h-svh flex-col bg-bg-default font-sans text-neutral-primary">
        <Head>
          <title>{`${copy.many(posting.postings.length)} | Harper`}</title>
        </Head>
        <header className="flex h-14 items-center px-4 md:px-6">
          <Image src="/svgs/logov2.svg" alt="Harper" width={64} height={29} priority />
        </header>
        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-4 py-10 md:px-6">
          <h1 className="text-[24px] font-medium leading-[1.4] md:text-[30px]">{copy.many(posting.postings.length)}</h1>
          <PostingList postings={posting.postings} />
          <div className="mt-8 flex w-full flex-col md:w-fit">
            <MuteButton size="lg" variant="primary" onClick={onStart}>{copy.startMany}</MuteButton>
            <p className="mt-3 break-keep text-[13px] leading-6 text-neutral-primary/60">{copy.next}</p>
          </div>
        </div>
      </main>
    );
  }
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
  const query = useInviteStart(mailId);
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
        <FaceLoading />
      </main>
    );
  }
  // No posting to show (a coaching mail, an events-only mail, an old link, not a candidate mail): straight on with
  // onboarding.
  if (!query.data?.posting) return null;
  return <GtmInviteFirstScreenView posting={query.data.posting} onStart={start} />;
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
