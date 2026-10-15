import dynamic from "next/dynamic";
import type { GetServerSideProps } from "next";
import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
const OrgRoleCreationPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgRoleCreationPage").then(
      (module) => module.OrgRoleCreationPage
    ),
  { loading: () => <OrgPageLoading /> }
);

export default function OrgRoleWorkspaceRoute() {
  return (
    <OrgWorkspaceApp page="role">
      <OrgRoleCreationPage />
    </OrgWorkspaceApp>
  );
}

export const getServerSideProps: GetServerSideProps = async ({
  query,
  resolvedUrl,
}) => {
  const roleId = typeof query.roleId === "string" ? query.roleId.trim() : "";
  if (roleId) return { props: {} };

  const queryIndex = resolvedUrl.indexOf("?");
  const search = queryIndex >= 0 ? resolvedUrl.slice(queryIndex) : "";
  return {
    redirect: {
      destination: `/org/new${search}`,
      permanent: false,
    },
  };
};
