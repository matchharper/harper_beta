import type { GetStaticProps } from "next";
import LegalDocumentPage, {
  LegalDocumentPageProps,
} from "@/components/landing/LegalDocumentPage";
import { fetchLegalDocument } from "@/lib/notion/legal";

const TERMS_SOURCE_URL =
  "https://peat-find-598.notion.site/Terms-Conditions-2e684af768c68093aa9bc758db8659a5?pvs=74";
const TERMS_PAGE_ID = "2e684af7-68c6-8093-aa9b-c758db8659a5";

export const getStaticProps: GetStaticProps<LegalDocumentPageProps> = async () => {
  try {
    const document = await fetchLegalDocument(TERMS_PAGE_ID);
    return {
      props: {
        document,
        sourceUrl: TERMS_SOURCE_URL,
        fallbackTitle: "Terms & Conditions",
      },
      revalidate: 3600,
    };
  } catch (_error) {
    return {
      props: {
        document: null,
        sourceUrl: TERMS_SOURCE_URL,
        fallbackTitle: "Terms & Conditions",
      },
      revalidate: 300,
    };
  }
};

export default function TermsPage(props: LegalDocumentPageProps) {
  return <LegalDocumentPage {...props} />;
}
