import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import dynamic from "next/dynamic";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
const OrgTeamPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgTeamPage").then(
      (module) => module.OrgTeamPage
    ),
  { loading: () => <OrgPageLoading page="member" /> }
);

export default function OrgMemberRoute() {
  return (
    <OrgWorkspaceApp page="member">
      <OrgTeamPage section="members" />
    </OrgWorkspaceApp>
  );
}
