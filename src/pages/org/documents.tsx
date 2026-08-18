import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GetStaticProps } from "next";
import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgDocumentsPage } from "@/components/org/workspace/pages/OrgDocumentsPage";

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
  return (
    <OrgWorkspaceApp page="documents">
      <OrgDocumentsPage markdown={markdown} />
    </OrgWorkspaceApp>
  );
}
