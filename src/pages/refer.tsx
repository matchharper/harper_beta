import type { GetServerSideProps } from "next";
import Link from "next/link";
import { UserRoundPlus } from "lucide-react";
import DocumentPageShell from "@/components/landing/DocumentPageShell";
import {
  ReferralProgramHowItWorks,
  ReferralProgramIntroduction,
  ReferralProgramReward,
} from "@/components/career/referral/ReferralProgramOverview";
import { MuteButton } from "@/components/ui/button";
import {
  normalizeLocale,
  resolveLocaleFromLanguage,
} from "@/i18n/localeResolution";
import { MessagesProvider, type Locale } from "@/i18n/useMessage";

type ReferralProgramPageProps = {
  locale: Locale;
};

const PUBLIC_COPY: Record<
  Locale,
  {
    description: string;
    start: string;
    startDescription: string;
    title: string;
  }
> = {
  ko: {
    description:
      "Harper를 소개하고, 소개한 사람이 Harper를 통해 채용되면 보상을 받을 수 있습니다.",
    start: "회원가입 후 내 초대 링크 만들기",
    startDescription:
      "회원가입하면 나만의 초대 링크를 만들고, 초대 현황과 보상 진행 상태를 확인할 수 있습니다.",
    title: "추천하고 보상받기",
  },
  en: {
    description:
      "Refer someone to Harper and earn a reward if they are hired through Harper.",
    start: "Sign up to create your invite link",
    startDescription:
      "After signing up, you can create your personal invite link and track referrals and reward progress.",
    title: "Refer and earn",
  },
};

export const getServerSideProps: GetServerSideProps<
  ReferralProgramPageProps
> = async ({ query, req }) => {
  const requestedLanguage = Array.isArray(query.lang)
    ? query.lang[0]
    : query.lang;
  const acceptLanguage = String(req.headers["accept-language"] ?? "");
  const locale =
    normalizeLocale(requestedLanguage) ??
    normalizeLocale(req.cookies.NEXT_LOCALE) ??
    resolveLocaleFromLanguage(acceptLanguage.split(",")[0]);

  return { props: { locale } };
};

function ReferralProgramPageContent({ locale }: ReferralProgramPageProps) {
  const copy = PUBLIC_COPY[locale];
  const signUpHref = "/career_login?next=%2Fcareer%3Fintent%3Dreferral";

  return (
    <DocumentPageShell
      title={copy.title}
      description={copy.description}
      locale={locale}
      landingChrome
      contentWidth="reading"
    >
      <div className="break-keep text-neutral-primary">
        <ReferralProgramIntroduction />
        <div className="mt-4 py-5">
          <ReferralProgramHowItWorks />
          <ReferralProgramReward />
          <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
            <div className="rounded-lg border border-neutral-1000-a05 bg-primary-faded p-5">
              <h2 className="text-[16px] font-medium leading-6 text-neutral-primary">
                {copy.start}
              </h2>
              <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
                {copy.startDescription}
              </p>
              <MuteButton asChild variant="primary" size="lg" className="mt-4">
                <Link href={signUpHref}>
                  <UserRoundPlus className="h-4 w-4" />
                  {copy.start}
                </Link>
              </MuteButton>
            </div>
          </section>
        </div>
      </div>
    </DocumentPageShell>
  );
}

export default function ReferralProgramPage(props: ReferralProgramPageProps) {
  return (
    <MessagesProvider locale={props.locale}>
      <ReferralProgramPageContent {...props} />
    </MessagesProvider>
  );
}
