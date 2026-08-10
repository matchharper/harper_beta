import type { GetServerSideProps } from "next";

export default function LegacyOrgRoleCreationRoute() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ resolvedUrl }) => {
  const queryIndex = resolvedUrl.indexOf("?");
  const query = queryIndex >= 0 ? resolvedUrl.slice(queryIndex) : "";

  return {
    redirect: {
      destination: `/org/new${query}`,
      permanent: false,
    },
  };
};
