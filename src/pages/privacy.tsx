import type { GetStaticProps } from "next";
import LegalDocumentPage, {
  LegalDocumentPageProps,
} from "@/components/landing/LegalDocumentPage";
import { fetchLegalDocument } from "@/lib/notion/legal";

const PRIVACY_SOURCE_URL =
  "https://peat-find-598.notion.site/Privacy-2e684af768c680fe8983fb88fa6d8677?pvs=74";
const PRIVACY_PAGE_ID = "2e684af7-68c6-80fe-8983-fb88fa6d8677";

export const getStaticProps: GetStaticProps<LegalDocumentPageProps> = async () => {
  try {
    const document = await fetchLegalDocument(PRIVACY_PAGE_ID);
    return {
      props: {
        document,
        sourceUrl: PRIVACY_SOURCE_URL,
        fallbackTitle: "Privacy",
      },
      revalidate: 3600,
    };
  } catch (_error) {
    return {
      props: {
        document: null,
        sourceUrl: PRIVACY_SOURCE_URL,
        fallbackTitle: "Privacy",
      },
      revalidate: 300,
    };
  }
};

export default function PrivacyPage(props: LegalDocumentPageProps) {
  return <LegalDocumentPage {...props} />;
}
