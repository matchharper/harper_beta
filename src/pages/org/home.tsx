import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import dynamic from "next/dynamic";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
const OrgHomePage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgHomePage").then(
      (module) => module.OrgHomePage
    ),
  { loading: () => <OrgPageLoading page="home" /> }
);

export default function OrgHomeRoute() {
  return (
    <OrgWorkspaceApp page="home">
      <OrgHomePage />
    </OrgWorkspaceApp>
  );
}
