import { orgSlotsRedirectQuery } from "@/lib/org/routes";
import { useRouter } from "next/router";
import { useEffect } from "react";

/** Slots live inside billing now; old links and Stripe returns land there. */
export default function OrgSlotsRoute() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    void router.replace({
      pathname: "/org/billing",
      query: orgSlotsRedirectQuery(router.query),
    });
  }, [router, router.isReady, router.query]);
  return null;
}
