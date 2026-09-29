"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, type MouseEventHandler } from "react";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { MessagesProvider, useMessages } from "@/i18n/useMessage";
import { useAuthStore } from "@/store/useAuthStore";

const CustomCrispWidget = dynamic(
  () => import("@/components/feedback/CustomCrispWidget"),
  { ssr: false, loading: () => null }
);

const COPY = {
  ko: {
    title: "페이지를 찾을 수 없습니다.",
    home: "홈으로",
  },
  en: {
    title: "Page not found.",
    home: "Go home",
  },
};

type NotFoundPageProps = {
  careerStartHref: string;
  onCareerStartClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function AppNotFoundPage() {
  const init = useAuthStore((state) => state.init);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <MessagesProvider>
      <NotFoundPage careerStartHref={user ? "/career" : "/career_login"} />
      <CustomCrispWidget showLauncher={false} />
    </MessagesProvider>
  );
}

export default function NotFoundPage({
  careerStartHref,
  onCareerStartClick,
}: NotFoundPageProps) {
  const { locale, setLocale } = useMessages();
  const copy = COPY[locale];

  return (
    <div className="min-h-screen bg-bg-basement pt-[54px] text-neutral-primary">
      <CareerAppBar
        careerStartHref={careerStartHref}
        onCareerStartClick={onCareerStartClick}
        locale={locale}
        sectionHrefPrefix="/"
      />

      <main className="flex h-[60vh] min-h-[360px] flex-col items-center justify-center gap-6 px-4 text-center lg:h-[70vh]">
        <Text
          variant="metric"
          className="text-[32px] font-normal sm:text-[64px]"
        >
          404
        </Text>
        <Text as="h1" variant="head1" className="font-normal">
          {copy.title}
        </Text>
        <MuteButton asChild variant="dark" size="sm">
          <Link href="/">{copy.home}</Link>
        </MuteButton>
      </main>

      <CareerLandingFooter
        careerStartHref={careerStartHref}
        onCareerStartClick={onCareerStartClick}
        locale={locale}
        onLocaleChange={setLocale}
      />
    </div>
  );
}
