// src/pages/_app.tsx
import ToastProvider from "@/components/toast/ToastProvider";
import "@/globals.css";
import type { AppProps } from "next/app";
import ReactQueryProvider from "@/components/Provider";
import {
  Roboto,
  Averia_Serif_Libre,
  Inter,
  Cormorant_Garamond,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import CompanyModalRoot from "@/components/Modal/CompanyModal";
import CandidateModalRoot from "@/components/Modal/CandidateModal";

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

  useEffect(() => {
    if (!loading && user && !companyUser && !companyUserLoading) {
      load(user.id);
    }
  }, [loading, user, load, companyUser, companyUserLoading]);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <ReactQueryProvider>
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
