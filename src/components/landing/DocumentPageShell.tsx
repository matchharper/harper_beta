import Head from "next/head";
import Link from "next/link";
import type { ReactNode } from "react";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";
import { usePublicPageVisitLog } from "@/hooks/usePublicPageVisitLog";
import type { Locale } from "@/i18n/useMessage";

type DocumentPageShellProps = {
  aside?: ReactNode;
  children: ReactNode;
  contentWidth?: "wide" | "reading";
  description?: string;
  landingChrome?: boolean;
  locale: Locale;
  title: string;
};

export default function DocumentPageShell({
  aside,
  children,
  contentWidth = "wide",
  description,
  landingChrome = false,
  locale,
  title,
}: DocumentPageShellProps) {
  usePublicPageVisitLog();
  const { careerStartHref, handleCareerStartClick } = useCareerLandingStart({
    trackingEnabled: false,
  });

  return (
    <main className="min-h-screen bg-bg-default text-neutral-primary">
      <Head>
        <title>{title} | Harper</title>
        {description ? <meta name="description" content={description} /> : null}
      </Head>

      {landingChrome ? (
        <CareerAppBar
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          locale={locale}
          sectionHrefPrefix="/"
        />
      ) : (
        <header className="border-b border-neutral-1000-a05 bg-bg-default">
          <div className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-4 sm:px-6">
            <Link
              href="/"
              className="font-hedvig text-[18px] text-neutral-primary"
            >
              Harper
            </Link>
            <Link href="/career" className="text-[13px] text-neutral-muted">
              Career
            </Link>
          </div>
        </header>
      )}

      <div
        className={`mx-auto flex flex-col gap-20 px-4 sm:px-6 ${
          contentWidth === "reading" ? "max-w-[960px]" : "max-w-[1240px]"
        } ${
          landingChrome ? "pt-24 lg:pt-38" : "pt-10 lg:pt-14"
        }`}
      >
        <header className="flex flex-col gap-4 font-normal">
          <h1 className="max-w-[900px] text-[30px] font-normal leading-[1.2] tracking-normal text-neutral-primary sm:text-[48px] lg:text-[56px]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-[720px] text-[14px] leading-6 text-neutral-muted sm:text-[16px]">
              {description}
            </p>
          ) : null}
        </header>

        <div
          className={`mx-auto grid w-full gap-16 pb-10 lg:pb-14 ${
            aside ? "lg:grid-cols-[240px_1fr]" : "max-w-[960px]"
          }`}
        >
          {aside ? (
            <aside
              className={`lg:sticky lg:h-fit ${
                landingChrome ? "lg:top-24" : "lg:top-8"
              }`}
            >
              {aside}
            </aside>
          ) : null}
          <article className="min-w-0 rounded-lg">{children}</article>
        </div>
      </div>

      <CareerLandingFooter
        careerStartHref={careerStartHref}
        onCareerStartClick={handleCareerStartClick}
        locale={locale}
        showLocaleSwitcher={false}
      />
    </main>
  );
}
