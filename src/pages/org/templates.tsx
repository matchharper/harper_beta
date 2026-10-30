import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import dynamic from "next/dynamic";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
const OrgTemplatesPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgTemplatesPage").then(
      (module) => module.OrgTemplatesPage
    ),
  { loading: () => <OrgPageLoading page="templates" /> }
);

export default function OrgTemplatesRoute() {
  return (
    <OrgWorkspaceApp page="templates">
      <OrgTemplatesPage />
    </OrgWorkspaceApp>
  );
}
