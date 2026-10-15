import { useRouter } from "next/router";
import { useEffect } from "react";
import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import dynamic from "next/dynamic";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
const OrgTeamPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgTeamPage").then(
      (module) => module.OrgTeamPage
    ),
  { loading: () => <OrgPageLoading page="team" /> }
);

export default function OrgTeamRoute() {
  const router = useRouter();
  const legacyMembersRoute = router.query.section === "members";

  useEffect(() => {
    if (!router.isReady || !legacyMembersRoute) return;
    const query = { ...router.query };
    delete query.section;
    void router.replace({ pathname: "/org/member", query });
  }, [legacyMembersRoute, router, router.isReady, router.query]);

  if (legacyMembersRoute) return null;

  return (
    <OrgWorkspaceApp page="team">
      <OrgTeamPage section="company" />
    </OrgWorkspaceApp>
  );
}
