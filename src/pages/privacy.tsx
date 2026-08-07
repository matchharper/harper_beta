import type { GetServerSideProps } from "next";
import VersionedLegalDocumentPage, {
  type VersionedLegalDocumentPageProps,
} from "@/components/landing/VersionedLegalDocumentPage";
import {
  normalizeLocale,
  resolveLocaleFromLanguage,
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
    resolveLocaleFromLanguage(acceptLanguage.split(",")[0]);

  return {
    props: {
      document: await loadVersionedLegalDocument("privacy-policy", locale),
    },
  };
};

export default function PrivacyPage(props: VersionedLegalDocumentPageProps) {
  return <VersionedLegalDocumentPage {...props} />;
}
