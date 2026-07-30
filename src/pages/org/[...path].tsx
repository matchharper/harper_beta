import type { GetServerSideProps } from "next";

export default function OrgNotFoundRedirectPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/org",
    permanent: false,
  },
});
