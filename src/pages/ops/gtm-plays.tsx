import Head from "next/head";
import OpsShell from "@/components/ops/OpsShell";
import GtmPlaysWorkspace from "@/components/ops/gtmPlays/GtmPlaysWorkspace";

export default function OpsGtmPlaysPage() {
  return (
    <>
      <Head>
        <title>GTM 플레이 · Harper Ops</title>
      </Head>
      <OpsShell>
        <GtmPlaysWorkspace />
      </OpsShell>
    </>
  );
}
