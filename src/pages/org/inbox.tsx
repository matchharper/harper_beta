import type { GetServerSideProps } from "next";
import { orgInboxHomeRedirect } from "@/lib/org/routes";

// Today's inbox is Home's 후보.
export default function OrgInboxRoute() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => ({
  redirect: {
    destination: orgInboxHomeRedirect(query),
    permanent: false,
  },
});
