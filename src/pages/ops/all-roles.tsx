import Head from "next/head";
import OpsShell from "@/components/ops/OpsShell";
import { MatchingAllRoles } from "@/components/ops/matching/MatchingAllRoles";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";

export default function OpsAllRolesPage() {
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);

  return (
    <>
      <Head>
        <title>All Roles | Harper Ops</title>
      </Head>
      <OpsShell compactHeader title="All Roles">
        <MatchingAllRoles canFetchInternal={canFetchInternal} />
      </OpsShell>
    </>
  );
}
