import type { GetStaticProps } from "next";
import VersionedLegalDocumentPage, {
  type VersionedLegalDocumentPageProps,
} from "@/components/landing/VersionedLegalDocumentPage";
import { loadVersionedLegalDocument } from "@/lib/legalDocs.server";

export const getStaticProps: GetStaticProps<
  VersionedLegalDocumentPageProps
> = async () => ({
  props: {
    document: await loadVersionedLegalDocument("privacy-policy"),
  },
});

export default function PrivacyPage(props: VersionedLegalDocumentPageProps) {
  return <VersionedLegalDocumentPage {...props} />;
}
