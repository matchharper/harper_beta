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
import { isSlotPurchase } from "@/lib/org/billing/compat";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function OrgBillingRoute() {
  const router = useRouter();
  const redirectToSlots =
    ["slots", "credits", "subscription"].includes(String(router.query.tab)) ||
    typeof router.query.checkout === "string" ||
    isSlotPurchase(router.query.purchase);
  useEffect(() => {
    if (!router.isReady || !redirectToSlots) return;
    const query = { ...router.query };
    delete query.tab;
    void router.replace({ pathname: "/org/slots", query });
  }, [router, router.isReady, router.query, redirectToSlots]);
  if (redirectToSlots) return null;
  return (
    <OrgWorkspaceApp page="billing">
      <OrgBillingPage />
    </OrgWorkspaceApp>
  );
}
