import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgBillingPage } from "@/components/org/workspace/pages/OrgBillingPage";

export default function OrgSlotsRoute() {
  return (
    <OrgWorkspaceApp page="slots">
      <OrgBillingPage section="slots" />
    </OrgWorkspaceApp>
  );
}
