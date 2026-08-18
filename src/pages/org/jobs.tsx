import type { GetServerSideProps } from "next";
import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgJobsPage } from "@/components/org/workspace/pages/OrgJobsPage";

export default function OrgJobsRoute() {
  return (
    <OrgWorkspaceApp page="jobs">
      <OrgJobsPage />
    </OrgWorkspaceApp>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const roleId = typeof query.roleId === "string" ? query.roleId.trim() : "";
  if (!roleId || roleId === "all") return { props: {} };

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" && value.trim()) params.set(key, value);
  }
  params.set("roleId", roleId);
  if (params.get("view") === "pipeline") {
    params.set("tab", "pipeline");
    params.set("view", "pipeline");
  } else {
    params.delete("view");
    params.delete("tab");
  }

  return {
    redirect: {
      destination: `/org/role?${params.toString()}`,
      permanent: false,
    },
  };
};
