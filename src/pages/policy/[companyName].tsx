import type { GetServerSideProps } from "next";
import VersionedLegalDocumentPage, {
  type VersionedLegalDocumentPageProps,
} from "@/components/landing/VersionedLegalDocumentPage";
import {
  applyCompanyNameToPolicyTemplate,
  COMPANY_PROFILE_SHARING_POLICY_SLUG,
  normalizeCompanyProfileSharingPolicyName,
} from "@/lib/legal/companyProfileSharingPolicy";
import {
  normalizeLocale,
  resolveLocaleFromCountryLanguage,
} from "@/i18n/localeResolution";
import { loadVersionedLegalDocument } from "@/lib/legalDocs.server";

export const getServerSideProps: GetServerSideProps<
  VersionedLegalDocumentPageProps
> = async ({ params, query, req }) => {
  const rawCompanyName = Array.isArray(params?.companyName)
    ? params?.companyName[0]
    : params?.companyName;
  const companyName = normalizeCompanyProfileSharingPolicyName(rawCompanyName);

  if (!companyName) {
    return { notFound: true };
  }

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
  const template = await loadVersionedLegalDocument(
    COMPANY_PROFILE_SHARING_POLICY_SLUG,
    locale
  );
  const applyCompanyName = (value: string) =>
    applyCompanyNameToPolicyTemplate(value, companyName);

  return {
    props: {
      document: {
        ...template,
        body: applyCompanyNameToPolicyTemplate(template.body, companyName, {
          markdown: true,
        }),
        description: applyCompanyName(template.description),
        title: applyCompanyName(template.title),
      },
    },
  };
};

export default function CompanyProfileSharingPolicyPage(
  props: VersionedLegalDocumentPageProps
) {
  return <VersionedLegalDocumentPage {...props} />;
}
