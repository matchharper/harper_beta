import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GetStaticProps } from "next";
import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgDocumentsPage } from "@/components/org/workspace/pages/OrgDocumentsPage";
import {
  extractOrgDocumentsHeadings,
  ORG_DOCUMENTS_FAQ_HEADING,
} from "@/components/org/workspace/OrgDocumentsMarkdown";

type OrgDocumentsRouteProps = {
  markdown: string;
  englishMarkdown: string;
};

export const getStaticProps: GetStaticProps<
  OrgDocumentsRouteProps
> = async () => {
  const [markdown, englishMarkdown] = await Promise.all([
    readFile(path.join(process.cwd(), "src/content/org-documents.md"), "utf8"),
    readFile(
      path.join(process.cwd(), "src/content/org-documents.en.md"),
      "utf8"
    ),
  ]);
  return { props: { markdown, englishMarkdown } };
};

export default function OrgDocumentsRoute({
  markdown,
  englishMarkdown,
}: OrgDocumentsRouteProps) {
  const documentSections = [
    ...extractOrgDocumentsHeadings(markdown).filter(
      (heading) => heading.level === 2
    ),
    ORG_DOCUMENTS_FAQ_HEADING,
  ];
  return (
    <OrgWorkspaceApp documentSections={documentSections} page="documents">
      <OrgDocumentsPage markdown={markdown} englishMarkdown={englishMarkdown} />
    </OrgWorkspaceApp>
  );
}
