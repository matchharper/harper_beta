import Head from "next/head";
import { useRouter } from "next/router";
import OpsShell from "@/components/ops/OpsShell";
import { MatchingAcceptedTalents } from "@/components/ops/matching/MatchingAcceptedTalents";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";

export default function OpsAcceptedTalentsPage() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalDomainEmail(user?.email);

  return (
    <>
      <Head>
        <title>Accepted Talents | Harper Ops</title>
      </Head>
      <OpsShell compactHeader title="Accepted Talents">
        <MatchingAcceptedTalents
          canFetchInternal={canFetchInternal}
          currentUserEmail={user?.email}
          onSelectRole={(item) => {
            void router.push({
              pathname: "/ops/matching",
              query: {
                company: item.workspaceId,
                role: item.roleId,
                tab: "harper_review",
              },
            });
          }}
        />
      </OpsShell>
    </>
  );
}
