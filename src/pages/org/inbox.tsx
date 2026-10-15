import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import dynamic from "next/dynamic";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
const OrgInboxPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgInboxPage").then(
      (module) => module.OrgInboxPage
    ),
  { loading: () => <OrgPageLoading page="inbox" /> }
);

export default function OrgInboxRoute() {
  return (
    <OrgWorkspaceApp page="inbox">
      <OrgInboxPage />
    </OrgWorkspaceApp>
  );
}
