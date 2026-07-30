import type { GetServerSideProps } from "next";

export default function OpsNotFoundRedirectPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/ops",
    permanent: false,
  },
});
