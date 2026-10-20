import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { orgPageFromPath, type OrgWorkspacePageId } from "@/lib/org/routes";

/** Render the destination shell while Next loads its route bundle. */
export function useOrgNavigation(workspaceId: string) {
  const router = useRouter();
  const [pending, setPending] = useState<{
    url: string;
    page: OrgWorkspacePageId;
    sameWorkspace: boolean;
  } | null>(null);
  useEffect(() => {
    const start = (url: string, { shallow }: { shallow: boolean }) => {
      if (shallow || url === router.asPath) return;
      const target = new URL(url, window.location.origin);
      const current = new URL(router.asPath, window.location.origin);
      // Query-driven tabs and detail panels keep their mounted page and data.
      if (
        target.pathname === current.pathname &&
        target.searchParams.get("orgId") === workspaceId
      ) return;
      const page = orgPageFromPath(target.pathname);
      if (!page) return;
      setPending({
        url,
        page,
        sameWorkspace: target.searchParams.get("orgId") === workspaceId,
      });
    };
    const complete = (url: string) =>
      setPending((current) => (current?.url === url ? null : current));
    const failed = (_error: unknown, url: string) => complete(url);
    router.events.on("routeChangeStart", start);
    router.events.on("routeChangeComplete", complete);
    router.events.on("routeChangeError", failed);
    return () => {
      router.events.off("routeChangeStart", start);
      router.events.off("routeChangeComplete", complete);
      router.events.off("routeChangeError", failed);
    };
  }, [router.asPath, router.events, workspaceId]);
  return pending;
}
