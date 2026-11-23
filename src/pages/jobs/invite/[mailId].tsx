import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import OfficialJobMarkdown from "@/components/jobs/OfficialJobMarkdown";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { MuteButton } from "@/components/ui/button";
import { useRememberGtmInvite } from "@/hooks/career/useGtmInviteClaim";
import { GTM_OPEN_PARAM, useGtmMailOpened } from "@/hooks/gtmPlays/useGtmMailOpened";
import { eventDayLabel } from "@/lib/gtmPlays/agent/events";
import { parseSignupNext, signupNextQuery } from "@/lib/gtmPlays/agent/signupMove";
import type { AgentOfferEvent } from "@/lib/gtmPlays/agent/types";
import type { GtmInvitePage } from "@/lib/gtmPlays/invitePage.server";

/** signupQuery: an Ashley link's next step (?next=&posting=&question=), carried on to /career (#5). */
type Props = { invite: GtmInvitePage; signupQuery: string };

const COPY = {
  ko: {
    from: (name: string | null) => (name ? `${name}님이 Harper에서 보낸 공고예요` : "Harper에서 보낸 공고예요"),
    cta: "Harper로 계속하기",
    original: "공고 원문 보기",
    inbox: "가입하거나 로그인하면 이 공고가 내 기회에 담기고, Harper가 지원까지 도와드려요.",
    signup: "가입하면 Harper가 이 공고와 맞는 공고를 계속 찾아 드려요.",
    many: (count: number) => `맞을 것 같은 회사 ${count}곳이에요`,
    manyInbox: "가입하거나 로그인하면 이 공고들이 내 기회에 담기고, Harper가 지원까지 도와드려요.",
    // A general mail (agent/channels.ts): its postings and events, in the mail's words.
    general: "맞을 만한 기회를 모아 봤어요",
    postings: "지금 사람을 찾는 팀",
    events: "다가오는 행사",
    online: "온라인",
    eventPage: "행사 페이지 보기",
    generalInbox: "가입하면 맞는 공고를 계속 보내 드리고, 원하시면 지원도 대신 해 드려요.",
  },
  en: {
    from: (name: string | null) => (name ? `${name} sent you this role through Harper` : "A role sent to you through Harper"),
    cta: "Continue with Harper",
    original: "Original posting",
    inbox: "Sign up or log in and this role will be in your opportunities, with Harper helping you apply.",
    signup: "Sign up and Harper will keep finding roles like this one for you.",
    many: (count: number) => `${count} companies that may fit you`,
    manyInbox: "Sign up or log in and these roles will be in your opportunities, with Harper helping you apply.",
    general: "A few opportunities that might fit you",
    postings: "Teams hiring now",
    events: "Upcoming events",
    online: "Online",
    eventPage: "Event page",
    generalInbox: "Join and Harper keeps sending roles that fit you, and can apply on your behalf whenever you want.",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

/** A general mail's events as cards like the postings': who runs it, its name, day and place, why, its own page. */
function EventList({ events, copy, language }: { events: readonly AgentOfferEvent[]; copy: Copy; language: "ko" | "en" }) {
  return (
    <ul className="mt-3 max-w-[760px] space-y-3">
      {events.map((event) => (
        <li key={event.url} className="rounded-sm border border-beige900/10 bg-bg-floating/35 p-5 md:p-6">
          {event.organizer ? <p className="text-[15px] font-medium text-neutral-primary">{event.organizer}</p> : null}
          <p className={`${event.organizer ? "mt-1 " : ""}text-[17px] leading-[1.5] text-neutral-primary wrap-break-word`}>{event.title}</p>
          <p className="mt-2 inline-flex items-center gap-2 text-[13px] text-neutral-primary/70">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {[eventDayLabel(event.startsAt, language), event.online ? copy.online : event.place].filter(Boolean).join(" · ")}
          </p>
          {event.why ? <p className="mt-3 break-keep text-[14px] leading-6 text-neutral-primary/80">{event.why}</p> : null}
          <a href={event.url} target="_blank" rel="noopener noreferrer" className="mt-3 flex w-fit items-center text-[13px] text-neutral-primary/70 underline">
            {copy.eventPage}
            <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Where a #4 후보 메일's button lands (/jobs/invite/<mail id>): the posting the mail was about, readable before
 * signing up, then "Harper로 계속하기" (/career?gtm=…, which keeps the mail through sign-up and onboarding and
 * then puts the posting in the inbox). Not indexed. A general agent mail's events show under its postings (or alone
 * when it proposed none), with the same button.
 */
export default function GtmInvitePostingPage({ invite, signupQuery }: Props) {
  const copy = COPY[invite.language];
  const { posting, events } = invite;
  // An events-only mail keeps the mail alone (no posting name for the sign-up screens).
  useRememberGtmInvite({
    mailId: invite.mailId, title: posting?.title ?? "", companyName: posting?.companyName ?? null, count: invite.postings?.length ?? 1,
  });
  // Counted on the mail as a click (Ops #4 숫자 표) once the page has been on screen for a second.
  useGtmMailOpened(invite.mailId);
  const continueHref = `/career?gtm=${encodeURIComponent(invite.mailId)}&utm_source=harper_gtm&utm_medium=email&utm_campaign=${invite.campaign}${signupQuery ? `&${signupQuery}` : ""}`;
  // #5 agent mails propose 2-3 postings: the page lists them all, and signing up puts all of them in the inbox. A
  // general mail lists its events too (signing up saves them in the person's 볼 만한 것 as well).
  const postings = invite.postings ?? [];
  const general = events.length > 0;
  if (!posting || postings.length > 1 || general) {
    const title = general ? copy.general : copy.many(postings.length);
    return (
      <>
        <Head>
          <title>{`${title} | Harper`}</title>
          <meta key="robots" name="robots" content="noindex,nofollow" />
          <link rel="icon" href="/images/logo.ico" />
        </Head>
        <Page as="div" background="beige" minHeight="svh" safeArea="bottom">
          <header className="border-b border-neutral-1000-a05 bg-bg-default">
            <div className="mx-auto flex h-14 max-w-[1160px] items-center px-4 md:px-6 lg:px-8">
              <Link href="/" className="flex items-center">
                <Image src="/svgs/logov2.svg" alt="Harper" width={64} height={29} priority />
              </Link>
            </div>
          </header>
          <main>
            <PageContainer as="article" size="default" padding="default" className="py-8 md:py-12">
              <p className="text-[13px] text-neutral-primary/60">{copy.from(invite.senderName)}</p>
              <h1 className="mt-6 max-w-[680px] text-[24px] font-normal leading-[1.4] text-neutral-primary md:text-[32px] md:font-medium">
                {title}
              </h1>
              {general && postings.length ? <p className="mt-8 text-[13px] text-neutral-primary/60">{copy.postings}</p> : null}
              {postings.length ? (
                <ul className={`${general ? "mt-3" : "mt-8"} max-w-[760px] space-y-3`}>
                  {postings.map((item) => (
                    <li key={`${item.companyName}|${item.title}`} className="rounded-sm border border-beige900/10 bg-bg-floating/35 p-5 md:p-6">
                      <p className="text-[15px] font-medium text-neutral-primary">{item.companyName}</p>
                      <p className="mt-1 text-[17px] leading-[1.5] text-neutral-primary wrap-break-word">{item.title}</p>
                      {item.location ? (
                        <p className="mt-2 inline-flex items-center gap-2 text-[13px] text-neutral-primary/70">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {item.location}
                        </p>
                      ) : null}
                      {item.summary || item.why ? (
                        <p className="mt-3 break-keep text-[14px] leading-6 text-neutral-primary/80">{item.summary || item.why}</p>
                      ) : null}
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center text-[13px] text-neutral-primary/70 underline">
                          {copy.original}
                          <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {general ? (
                <>
                  <p className="mt-8 text-[13px] text-neutral-primary/60">{copy.events}</p>
                  <EventList events={events} copy={copy} language={invite.language} />
                </>
              ) : null}
              <div className="mt-8 flex w-full md:w-fit">
                <MuteButton asChild size="lg" variant="primary" className="w-full">
                  <Link href={continueHref}>{copy.cta}</Link>
                </MuteButton>
              </div>
              <p className="mt-3 max-w-[560px] break-keep text-[13px] leading-6 text-neutral-primary/60">{general ? copy.generalInbox : copy.manyInbox}</p>
            </PageContainer>
          </main>
        </Page>
      </>
    );
  }

  const heading = [posting.companyName, posting.title].filter(Boolean).join(" · ");
  return (
    <>
      <Head>
        <title>{`${heading} | Harper`}</title>
        <meta key="robots" name="robots" content="noindex,nofollow" />
        <link rel="icon" href="/images/logo.ico" />
      </Head>
      <Page as="div" background="beige" minHeight="svh" safeArea="bottom">
        <header className="border-b border-neutral-1000-a05 bg-bg-default">
          <div className="mx-auto flex h-14 max-w-[1160px] items-center px-4 md:px-6 lg:px-8">
            <Link href="/" className="flex items-center">
              <Image src="/svgs/logov2.svg" alt="Harper" width={64} height={29} priority />
            </Link>
          </div>
        </header>
        <main>
          <PageContainer as="article" size="default" padding="default" className="py-8 md:py-12">
            <p className="text-[13px] text-neutral-primary/60">{copy.from(invite.senderName)}</p>
            {posting.companyName ? (
              <p className="mt-6 text-[15px] font-medium text-neutral-primary">{posting.companyName}</p>
            ) : null}
            <h1 className="mt-2 max-w-[680px] text-[24px] font-normal leading-[1.4] text-neutral-primary wrap-break-word md:text-[32px] md:font-medium">
              {posting.title}
            </h1>
            {posting.location ? (
              <p className="mt-4 inline-flex items-center gap-2 text-[13px] text-neutral-primary md:text-[15px]">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {posting.location}
              </p>
            ) : null}
            <div className="mt-8 flex w-full flex-col gap-2 md:w-fit md:flex-row">
              <MuteButton asChild size="lg" variant="primary">
                <Link href={continueHref}>{copy.cta}</Link>
              </MuteButton>
              {posting.url ? (
                <MuteButton asChild size="lg" variant="default">
                  <a href={posting.url} target="_blank" rel="noopener noreferrer">
                    {copy.original}
                    <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </a>
                </MuteButton>
              ) : null}
            </div>
            <p className="mt-3 max-w-[560px] break-keep text-[13px] leading-6 text-neutral-primary/60">
              {invite.importable ? copy.inbox : copy.signup}
            </p>
            {/* One button, at the top (Shaun 11/23: a second one under the box read as a different step). */}
            <div className="mt-12 max-w-[760px] rounded-sm border border-bg-floating/0 bg-bg-floating/0 p-0 md:border-beige900/10 md:bg-bg-floating/35 md:p-8">
              <OfficialJobMarkdown content={posting.description} />
            </div>
          </PageContainer>
        </main>
      </Page>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const mailId = typeof context.params?.mailId === "string" ? context.params.mailId : "";
  const signupQuery = signupNextQuery(parseSignupNext(context.query));
  const { readGtmInvitePage } = await import("@/lib/gtmPlays/invitePage.server");
  const invite = await readGtmInvitePage(mailId).catch((error: unknown) => {
    console.error("[jobs/invite] could not read the mail", error);
    return null;
  });
  // A mail without a stored posting or events to come (a coaching mail, an old link) still works: straight to Harper
  // with the mail kept. No page here counts the click, so the sign-in page does (GTM_OPEN_PARAM).
  if (!invite) {
    const id = /^[0-9a-f-]{36}$/i.test(mailId) ? mailId : "";
    return {
      redirect: { destination: id ? `/career?gtm=${id}&${GTM_OPEN_PARAM}=1${signupQuery ? `&${signupQuery}` : ""}` : "/career", permanent: false },
    };
  }
  context.res.setHeader("Cache-Control", "private, no-store");
  return { props: { invite, signupQuery } };
};
