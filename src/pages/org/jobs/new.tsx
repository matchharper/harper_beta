import type { GetServerSideProps } from "next";

export default function LegacyOrgRoleCreationRoute() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({
  query: { roleId },
  resolvedUrl,
}) => {
  const queryIndex = resolvedUrl.indexOf("?");
  const query = queryIndex >= 0 ? resolvedUrl.slice(queryIndex) : "";
  const destination =
    typeof roleId === "string" && roleId.trim() ? "/org/role" : "/org/new";

  return {
    redirect: {
      destination: `${destination}${query}`,
      permanent: false,
    },
  };
};
