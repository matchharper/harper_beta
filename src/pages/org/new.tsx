import type { GetServerSideProps } from "next";
import dynamic from "next/dynamic";
import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
const OrgRoleCreationPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgRoleCreationPage").then(
      (module) => module.OrgRoleCreationPage
    ),
  { loading: () => <OrgPageLoading /> }
);

const OrgOrganizationCreationPage = dynamic(() =>
  import("@/components/org/onboarding/OrgOrganizationCreationPage").then(
    (module) => module.OrgOrganizationCreationPage
  )
);

export default function OrgRoleCreationRoute({
  createOrganization = false,
}: {
  createOrganization?: boolean;
}) {
  if (createOrganization)
    return (
      <OrgWorkspaceApp page="onboarding">
        <OrgOrganizationCreationPage />
      </OrgWorkspaceApp>
    );
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
  if (query.create === "organization")
    return { props: { createOrganization: true } };
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
