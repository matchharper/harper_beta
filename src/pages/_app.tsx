// src/pages/_app.tsx
import ToastProvider from "@/components/toast/ToastProvider";
import "@/globals.css";
import type { AppProps } from "next/app";
import ReactQueryProvider from "@/components/Provider";
import Head from "next/head";
import {
  Roboto,
  Averia_Serif_Libre,
  Inter,
  Cormorant_Garamond,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import CompanyModalRoot from "@/components/Modal/CompanyModal";
import Script from "next/script";
import { useRouter } from "next/router";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const inter = Inter({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
});

const garamond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-garamond",
});
// lib/fonts.ts

export const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

export const averia = Averia_Serif_Libre({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-averia",
  display: "swap",
});

export default function App({ Component, pageProps }: AppProps) {
  const init = useAuthStore((s) => s.init);
  const { user, loading } = useAuthStore();
  const {
    companyUser,
    load,
    loading: companyUserLoading,
  } = useCompanyUserStore();
  const lastFreeRefreshUserId = useRef<string | null>(null);
  const router = useRouter();

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
    if (!loading && user && !companyUser && !companyUserLoading) {
      load(user.id);
    }
  }, [loading, user, load, companyUser, companyUserLoading]);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!companyUser?.user_id) return;
    if (companyUserLoading) return;
    if (lastFreeRefreshUserId.current === companyUser.user_id) return;

    lastFreeRefreshUserId.current = companyUser.user_id;

    const payload = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: companyUser.user_id }),
    };

    Promise.all([
      fetch("/api/credits/free-refresh", payload),
      fetch("/api/credits/annual-refresh", payload),
    ]).catch((err) => {
      console.error("Failed to refresh credits:", err);
    });
  }, [companyUser?.user_id, companyUserLoading]);

  return (
    <ReactQueryProvider>
      <Head>
        <title>Harper — AI Recruiter</title>
        <meta
          name="description"
          content="Harper는 모든 팀들을 위한 전담 AI Recruiter입니다."
        />
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
      <div
        className={`${inter.className} ${inter.variable} ${garamond.className} ${garamond.variable} ${roboto.variable} ${averia.variable}`}
      >
        <CompanyModalRoot />
        <Analytics />
        <Component {...pageProps} />
        <ToastProvider />
      </div>
    </ReactQueryProvider>
  );
}
