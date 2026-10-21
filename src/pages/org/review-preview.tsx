import type { GetServerSideProps } from "next";
import { OrgReviewPage } from "@/components/org/workspace/OrgReviewPage";
import { OrgLocaleScope } from "@/i18n/org/OrgLocaleProvider";
import type { OrgLocale } from "@/i18n/org/locale";

export default function OrgReviewPreview({ locale }: { locale: OrgLocale }) {
  return (
    <OrgLocaleScope locale={locale}>
      <OrgReviewPage />
    </OrgLocaleScope>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  if (process.env.NODE_ENV !== "development") {
    return { notFound: true };
  }
  return { props: { locale: query.lang === "en" ? "en" : "ko" } };
};
