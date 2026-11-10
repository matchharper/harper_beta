import type { GetServerSideProps } from "next";
import { orgInboxHomeRedirect } from "@/lib/org/routes";

// The former inbox opens Home's 역할 (the lists are on each role).
export default function OrgInboxRoute() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => ({
  redirect: {
    destination: orgInboxHomeRedirect(query),
    permanent: false,
  },
});
