import type { GetServerSideProps } from "next";
export default function OrgInboxRoute() {
  return null;
}
export const getServerSideProps: GetServerSideProps = async ({
  resolvedUrl,
}) => ({
  redirect: {
    destination: `/org/home${resolvedUrl.includes("?") ? resolvedUrl.slice(resolvedUrl.indexOf("?")) : ""}`,
    permanent: false,
  },
});
