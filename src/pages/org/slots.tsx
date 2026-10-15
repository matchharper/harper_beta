import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import dynamic from "next/dynamic";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
const OrgBillingPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgBillingPage").then(
      (module) => module.OrgBillingPage
    ),
  { loading: () => <OrgPageLoading page="slots" /> }
);

export default function OrgSlotsRoute() {
  return (
    <OrgWorkspaceApp page="slots">
      <OrgBillingPage section="slots" />
    </OrgWorkspaceApp>
  );
}
