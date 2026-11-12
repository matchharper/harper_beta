import type { GetServerSideProps } from "next";
import { orgJobsHomeRedirect, orgJobsRoleRedirect } from "@/lib/org/routes";

// The 역할 page moved under Home. /org/jobs stays only for links already sent
// (Slack, email): a role opens its page; every role opens Home's 역할.
export default function OrgJobsRoute() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => ({
  redirect: {
    destination: orgJobsRoleRedirect(query) ?? orgJobsHomeRedirect(query),
    permanent: false,
  },
});
