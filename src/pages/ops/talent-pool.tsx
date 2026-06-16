import Head from "next/head";
import OpsShell from "@/components/ops/OpsShell";
import { MatchingTalentPool } from "@/components/ops/matching/MatchingTalentPool";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";

export default function OpsTalentPoolPage() {
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);

  return (
    <>
      <Head>
        <title>Talent Pool | Harper Ops</title>
      </Head>

      <OpsShell compactHeader title="Talent Pool">
        <MatchingTalentPool canFetchInternal={canFetchInternal} />
      </OpsShell>
    </>
  );
}
