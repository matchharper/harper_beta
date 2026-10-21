import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import { CompanyPricingSection } from "@/components/landing/CompanyWaitlistLanding";
import { MessagesProvider, type Locale } from "@/i18n/useMessage";
import { getCompanyLocalePath } from "@/lib/companyLandingSeo";
import { resolveOfficialJobsLocaleFromRequest } from "@/lib/officialJobs/copy";

export const getServerSideProps: GetServerSideProps<{
  locale: Locale;
}> = async ({ req, query }) => ({
  props: {
    locale:
      query.lang === "ko" || query.lang === "en"
        ? query.lang
        : resolveOfficialJobsLocaleFromRequest(req),
  },
});

export default function PricingPage({ locale }: { locale: Locale }) {
  const router = useRouter();
  const companyHref = getCompanyLocalePath(locale);
  const contactHref = `${companyHref}#company-contact`;
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);

  return (
    <MessagesProvider locale={locale}>
      <Head>
        <title>{c("가격 | Harper", "Pricing | Harper")}</title>
      </Head>
      <main
        id="top"
        lang={locale}
        className="bg-bg-basement pt-[54px] text-neutral-primary"
      >
        <CareerAppBar
          locale={locale}
          careerStartHref={contactHref}
          showPrimaryAction={false}
          showSectionLinks={false}
          audienceHref="/"
          navigationLinks={[
            { href: `/pricing?lang=${locale}`, label: c("가격", "Pricing") },
            {
              href: `${companyHref}#company-demo`,
              label: c("데모 영상", "Demo"),
            },
            {
              href: `${companyHref}#company-faq`,
              label: c("자주 묻는 질문", "FAQ"),
            },
          ]}
          secondaryAction={{
            href: `/org?lang=${locale}`,
            label: c("로그인", "Sign in"),
            mobileLabel: c("사용하러 가기", "Open Harper"),
          }}
        />
        <div className="mx-auto w-[calc(100%_-_48px)] max-w-[1040px] pb-20 md:w-[calc(100%_-_64px)] md:pb-32">
          <CompanyPricingSection
            locale={locale}
            onStart={() => void router.push(contactHref)}
          />
        </div>
      </main>
      <CareerLandingFooter
        audience="company"
        locale={locale}
        careerStartHref={contactHref}
        onLocaleChange={(nextLocale) =>
          void router.push(`/pricing?lang=${nextLocale}`)
        }
      />
    </MessagesProvider>
  );
}
