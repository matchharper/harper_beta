import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import dynamic from "next/dynamic";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
const OrgBillingPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgBillingPage").then(
      (module) => module.OrgBillingPage
    ),
  { loading: () => <OrgPageLoading page="billing" /> }
);
import { orgBillingOpensSlots } from "@/lib/org/routes";
import { useRouter } from "next/router";

export default function OrgBillingRoute() {
  const router = useRouter();
  return (
    <OrgWorkspaceApp page="billing">
      <OrgBillingPage
        section={orgBillingOpensSlots(router.query) ? "slots" : "billing"}
      />
    </OrgWorkspaceApp>
  );
}
