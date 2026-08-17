import type { GetServerSideProps } from "next";
import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgRoleCreationPage } from "@/components/org/workspace/pages/OrgRoleCreationPage";

export default function OrgRoleCreationRoute() {
  return (
    <OrgWorkspaceApp page="new-role">
      <OrgRoleCreationPage />
    </OrgWorkspaceApp>
  );
}

export const getServerSideProps: GetServerSideProps = async ({
  query,
  resolvedUrl,
}) => {
  const roleId = typeof query.roleId === "string" ? query.roleId.trim() : "";
  if (!roleId) return { props: {} };

  const queryIndex = resolvedUrl.indexOf("?");
  const search = queryIndex >= 0 ? resolvedUrl.slice(queryIndex) : "";
  return {
    redirect: {
      destination: `/org/role${search}`,
      permanent: false,
    },
  };
};
