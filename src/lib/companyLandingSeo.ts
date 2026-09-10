import type { Locale } from "@/i18n/useMessage";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

export const COMPANY_SITE_URL = getConfiguredPublicSiteUrl();

export const COMPANY_LOCALE_PATHS: Record<Locale, string> = {
  en: "/en/company",
  ko: "/ko/company",
};

export const COMPANY_LANGUAGE_ENTRY_PATH = "/company";
export const COMPANY_OG_IMAGE_URL = `${COMPANY_SITE_URL}/images/logos/thumbnail.png`;
export const COMPANY_ORGANIZATION_ID = `${COMPANY_SITE_URL}/#organization`;
export const COMPANY_WEBSITE_ID = `${COMPANY_SITE_URL}/#website`;

export function getCompanyLocalePath(locale: Locale) {
  return COMPANY_LOCALE_PATHS[locale];
}

export function getCompanyLocaleUrl(locale: Locale) {
  return `${COMPANY_SITE_URL}${getCompanyLocalePath(locale)}`;
}

export function getCompanyLanguageEntryUrl() {
  return `${COMPANY_SITE_URL}${COMPANY_LANGUAGE_ENTRY_PATH}`;
}
