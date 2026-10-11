import type { GetServerSideProps } from "next";
import CompanyPage, { type CompanyPageProps } from "@/pages/company";
import {
  COMPANY_CONCEPTS,
  type CompanyConcept,
} from "@/components/landing/company-preview/CompanyLandingConcepts";

export default CompanyPage;

export const getServerSideProps: GetServerSideProps<CompanyPageProps> = async ({
  params,
  query,
  res,
}) => {
  if (process.env.NODE_ENV === "production") return { notFound: true };
  const version = params?.version;
  if (
    typeof version !== "string" ||
    !COMPANY_CONCEPTS.includes(version as CompanyConcept)
  )
    return { notFound: true };
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, no-store");
  return {
    props: {
      locale: query.lang === "en" ? "en" : "ko",
      previewConcept: version as CompanyConcept,
    },
  };
};
