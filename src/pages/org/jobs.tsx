import type { GetServerSideProps } from "next";
import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import dynamic from "next/dynamic";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
import { orgJobsRoleRedirect } from "@/lib/org/routes";
const OrgJobsPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgJobsPage").then(
      (module) => module.OrgJobsPage
    ),
  { loading: () => <OrgPageLoading page="jobs" /> }
);

export default function OrgJobsRoute() {
  return (
    <OrgWorkspaceApp page="jobs">
      <OrgJobsPage />
    </OrgWorkspaceApp>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const destination = orgJobsRoleRedirect(query);
  if (!destination) return { props: {} };
  return { redirect: { destination, permanent: false } };
};
