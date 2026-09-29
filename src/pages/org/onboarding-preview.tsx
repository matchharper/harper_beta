import dynamic from "next/dynamic";
import type { GetServerSideProps } from "next";

const Preview = dynamic(
  () => import("@/components/org/onboarding/OrgOnboardingPreview"),
  { ssr: false }
);

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV === "production") return { notFound: true };
  return { props: {} };
};

export default function CompanyOnboardingPreview() {
  return process.env.NODE_ENV !== "production" ? <Preview /> : null;
}
