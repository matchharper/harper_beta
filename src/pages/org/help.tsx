import { useRouter } from "next/router";
import { useEffect } from "react";

export default function OrgHelpRedirectRoute() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const destination = `/org/documents${window.location.search}${window.location.hash}`;
    void router.replace(destination);
  }, [router, router.isReady]);

  return null;
}
