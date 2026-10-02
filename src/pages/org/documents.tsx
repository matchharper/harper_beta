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
};

export const getStaticProps: GetStaticProps<
  OrgDocumentsRouteProps
> = async () => ({
  props: {
    markdown: await readFile(
      path.join(process.cwd(), "src/content/org-documents.md"),
      "utf8"
    ),
  },
});

export default function OrgDocumentsRoute({
  markdown,
}: OrgDocumentsRouteProps) {
  const documentSections = [
    ...extractOrgDocumentsHeadings(markdown).filter(
      (heading) => heading.level === 2
    ),
    ORG_DOCUMENTS_FAQ_HEADING,
  ];
  return (
    <OrgWorkspaceApp documentSections={documentSections} page="documents">
      <OrgDocumentsPage markdown={markdown} />
    </OrgWorkspaceApp>
  );
}
