import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/ops/debugging/emails",
    permanent: false,
  },
});

export default function OpsDebuggingRedirectPage() {
  return null;
}
