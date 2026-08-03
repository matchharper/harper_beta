import type { GetServerSideProps } from "next";
import VersionedLegalDocumentPage, {
  type VersionedLegalDocumentPageProps,
} from "@/components/landing/VersionedLegalDocumentPage";
import {
  normalizeLocale,
  resolveLocaleFromCountryLanguage,
} from "@/i18n/localeResolution";
import { loadVersionedLegalDocument } from "@/lib/legalDocs.server";

export const getServerSideProps: GetServerSideProps<
  VersionedLegalDocumentPageProps
> = async ({ query, req }) => {
  const requestedLanguage = Array.isArray(query.lang)
    ? query.lang[0]
    : query.lang;
  const acceptLanguage = String(req.headers["accept-language"] ?? "");
  const locale =
    normalizeLocale(requestedLanguage) ??
    normalizeLocale(req.cookies.NEXT_LOCALE) ??
    resolveLocaleFromCountryLanguage({
      countryCode:
        req.headers["x-vercel-ip-country"] ??
        req.headers["cf-ipcountry"] ??
        "ZZ",
      language: acceptLanguage.split(",")[0],
    });

  return {
    props: {
      document: await loadVersionedLegalDocument("referral-terms", locale),
    },
  };
};

export default function ReferralTermsPage(
  props: VersionedLegalDocumentPageProps
) {
  return <VersionedLegalDocumentPage {...props} landingChrome />;
}
