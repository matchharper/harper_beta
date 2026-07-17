import type { GetStaticProps } from "next";
import VersionedLegalDocumentPage, {
  type VersionedLegalDocumentPageProps,
} from "@/components/landing/VersionedLegalDocumentPage";
import { loadVersionedLegalDocument } from "@/lib/legalDocs.server";

export const getStaticProps: GetStaticProps<
  VersionedLegalDocumentPageProps
> = async () => ({
  props: {
    document: await loadVersionedLegalDocument("referral-terms"),
  },
});

export default function ReferralTermsPage(
  props: VersionedLegalDocumentPageProps
) {
  return <VersionedLegalDocumentPage {...props} landingChrome />;
}
