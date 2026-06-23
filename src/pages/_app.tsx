// src/pages/_app.tsx
import ToastProvider from "@/components/toast/ToastProvider";
import "@/globals.css";
import type { AppProps } from "next/app";
import ReactQueryProvider from "@/components/Provider";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import Head from "next/head";
import { Analytics } from "@vercel/analytics/react";
import { useEffect, useLayoutEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import dynamic from "next/dynamic";
import CareerLanguageDevControls from "@/i18n/CareerLanguageDevControls";
import CareerTranslationInspectOverlay from "@/i18n/CareerTranslationInspectOverlay";
import { CareerTranslationInspectProvider } from "@/i18n/CareerTranslationInspectProvider";
import CareerTranslationRuntime from "@/i18n/CareerTranslationRuntime";
import {
  getCurrentCareerTranslationPath,
  isCareerTranslationRoute,
} from "@/i18n/careerTranslationRoutes";
import {
  getInitialClientLocalePreference,
  MessagesProvider,
  type Locale,
} from "@/i18n/useMessage";

const CompanyModalRoot = dynamic(
  () => import("@/components/Modal/CompanyModal"),
  { ssr: false, loading: () => null }
);
const PaperModalRoot = dynamic(() => import("@/components/Modal/PaperModal"), {
  ssr: false,
  loading: () => null,
});
const RepoModalRoot = dynamic(() => import("@/components/Modal/RepoModal"), {
  ssr: false,
  loading: () => null,
});
import Script from "next/script";
import { useRouter } from "next/router";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const CRISP_WEBSITE_ID = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
const CRISP_BOOTSTRAP_SCRIPT = CRISP_WEBSITE_ID
  ? `
      window.$crisp = window.$crisp || [];
      window.CRISP_WEBSITE_ID = ${JSON.stringify(CRISP_WEBSITE_ID)};
      var CRISP_WEBSITE_ID = window.CRISP_WEBSITE_ID;
      (function () {
        if (document.getElementById("crisp-loader")) return;
        var d = document;
        var s = d.createElement("script");
        s.id = "crisp-loader";
        s.src = "https://client.crisp.chat/l.js";
        s.async = 1;
        d.getElementsByTagName("head")[0].appendChild(s);
      })();
    `
  : null;
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function App({ Component, pageProps }: AppProps) {
  const init = useAuthStore((s) => s.init);
  const router = useRouter();
  const [careerLocale, setCareerLocale] = useState<Locale>("ko");
  const currentPath = getCurrentCareerTranslationPath(
    router.asPath || router.pathname
  );
  const isCareerPage = isCareerTranslationRoute(currentPath);
  const isCareerLoginPage = router.pathname === "/career_login";
  const isCareerLocalePage = isCareerPage || isCareerLoginPage;
  const isAdminCareerPage =
    router.pathname === "/admin/career" ||
    router.pathname.startsWith("/admin/career/");
  const isOpsPage =
    router.pathname === "/ops" || router.pathname.startsWith("/ops/");
  const shouldHideCrisp =
    isCareerPage ||
    isCareerLoginPage ||
    isAdminCareerPage ||
    isOpsPage ||
    router.pathname === "/" ||
    router.pathname === "/landing-ko-vf" ||
    router.pathname === "/network2";
  const shouldLoadCrisp = Boolean(CRISP_BOOTSTRAP_SCRIPT) && !shouldHideCrisp;
  const appDescription =
    isCareerLocalePage && careerLocale === "en"
      ? "Harper is an AI Career Agent for every talented professional."
      : "Harper는 모든 인재들을 위한 AI Career Agent입니다.";

  useIsomorphicLayoutEffect(() => {
    if (!isCareerLocalePage) return;
    setCareerLocale(getInitialClientLocalePreference());
  }, [isCareerLocalePage]);

  useEffect(() => {
    if (!GA_ID) return;

    const pageview = (url: string) => {
      // @ts-ignore
      if (typeof window.gtag !== "function") return;
      // @ts-ignore
      window.gtag("event", "page_view", {
        page_location: window.location.href,
        page_path: url,
      });
    };

    // ✅ 첫 진입도 기록
    pageview(window.location.pathname + window.location.search);

    const handleRouteChange = (url: string) => pageview(url);

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => router.events.off("routeChangeComplete", handleRouteChange);
  }, [router.events]);

  useEffect(() => {
    if (!CRISP_WEBSITE_ID) return;
    if (typeof window === "undefined") return;

    const crispWindow = window as Window & {
      $crisp?: Array<unknown[]>;
    };

    if (!crispWindow.$crisp) {
      if (shouldHideCrisp) return;
      crispWindow.$crisp = [];
    }

    crispWindow.$crisp.push([
      "do",
      shouldHideCrisp ? "chat:hide" : "chat:show",
    ]);
  }, [shouldHideCrisp]);

  useEffect(() => {
    init();
  }, [init]);

  const page = isCareerPage ? (
    <CareerTranslationInspectProvider>
      <CareerTranslationRuntime>
        <Component {...pageProps} />
        <CareerLanguageDevControls />
      </CareerTranslationRuntime>
      <CareerTranslationInspectOverlay />
    </CareerTranslationInspectProvider>
  ) : (
    <Component {...pageProps} />
  );

  return (
    <MessagesProvider
      locale={isCareerLocalePage ? careerLocale : undefined}
      onLocaleChange={isCareerLocalePage ? setCareerLocale : undefined}
    >
      <ReactQueryProvider>
        <Head>
          <title>Harper — AI Career Agent</title>
          <meta
            key="description"
            name="description"
            content={appDescription}
          />
          <meta key="theme-color" name="theme-color" content="#F7F0E8" />
        </Head>
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { send_page_view: false });
            `}
            </Script>
          </>
        )}
        {shouldLoadCrisp && (
          <Script id="crisp-chat" strategy="afterInteractive">
            {CRISP_BOOTSTRAP_SCRIPT}
          </Script>
        )}
        <div className="notranslate font-sans" translate="no">
          <Analytics />
          <AppErrorBoundary resetKey={router.asPath}>
            <CompanyModalRoot />
            <PaperModalRoot />
            <RepoModalRoot />
            {page}
            <ToastProvider />
          </AppErrorBoundary>
        </div>
      </ReactQueryProvider>
    </MessagesProvider>
  );
}
