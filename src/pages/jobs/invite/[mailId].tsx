import { ExternalLink, MapPin } from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import OfficialJobMarkdown from "@/components/jobs/OfficialJobMarkdown";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { MuteButton } from "@/components/ui/button";
import { useRememberGtmInvite } from "@/hooks/career/useGtmInviteClaim";
import type { GtmInvitePage } from "@/lib/gtmPlays/invitePage.server";

type Props = { invite: GtmInvitePage };

const COPY = {
  ko: {
    from: (name: string | null) => (name ? `${name}님이 Harper에서 보낸 공고예요` : "Harper에서 보낸 공고예요"),
    cta: "Harper로 계속하기",
    original: "공고 원문 보기",
    inbox: "가입하거나 로그인하면 이 공고가 내 기회에 담기고, Harper가 지원까지 도와드려요.",
    signup: "가입하면 Harper가 이 공고와 맞는 공고를 계속 찾아 드려요.",
  },
  en: {
    from: (name: string | null) => (name ? `${name} sent you this role through Harper` : "A role sent to you through Harper"),
    cta: "Continue with Harper",
    original: "Original posting",
    inbox: "Sign up or log in and this role will be in your opportunities, with Harper helping you apply.",
    signup: "Sign up and Harper will keep finding roles like this one for you.",
  },
} as const;

/**
 * Where a #4 후보 메일's button lands (/jobs/invite/<mail id>): the posting the mail was about, readable before
 * signing up, then "Harper로 계속하기" (/career?gtm=…, which keeps the mail through sign-up and onboarding and
 * then puts the posting in the inbox). Not indexed.
 */
export default function GtmInvitePostingPage({ invite }: Props) {
  const copy = COPY[invite.language];
  const { posting } = invite;
  useRememberGtmInvite({ mailId: invite.mailId, title: posting.title, companyName: posting.companyName });
  const continueHref = `/career?gtm=${encodeURIComponent(invite.mailId)}&utm_source=harper_gtm&utm_medium=email&utm_campaign=gtm_outreach`;
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
            <div className="mt-12 max-w-[760px] rounded-sm border border-bg-floating/0 bg-bg-floating/0 p-0 md:border-beige900/10 md:bg-bg-floating/35 md:p-8">
              <OfficialJobMarkdown content={posting.description} />
            </div>
            <div className="mt-10 flex w-full md:w-fit">
              <MuteButton asChild size="lg" variant="primary" className="w-full">
                <Link href={continueHref}>{copy.cta}</Link>
              </MuteButton>
            </div>
          </PageContainer>
        </main>
      </Page>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const mailId = typeof context.params?.mailId === "string" ? context.params.mailId : "";
  const { readGtmInvitePage } = await import("@/lib/gtmPlays/invitePage.server");
  const invite = await readGtmInvitePage(mailId).catch((error: unknown) => {
    console.error("[jobs/invite] could not read the mail", error);
    return null;
  });
  // A mail without a stored posting (or an old link) still works: straight to Harper with the mail kept.
  if (!invite) {
    const id = /^[0-9a-f-]{36}$/i.test(mailId) ? mailId : "";
    return { redirect: { destination: id ? `/career?gtm=${id}` : "/career", permanent: false } };
  }
  context.res.setHeader("Cache-Control", "private, no-store");
  return { props: { invite } };
};
