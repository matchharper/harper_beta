import Head from "next/head";
import OpsShell from "@/components/ops/OpsShell";
import OpsTalentMetricsWorkspace from "@/components/ops/metrics/OpsTalentMetricsWorkspace";

export default function OpsTalentMetricsPage() {
  return (
    <>
      <Head>
        <title>Talent 지표 · Harper Ops</title>
        <meta
          content="Harper talent product and mutual connection metrics"
          name="description"
        />
      </Head>
      <OpsShell compactHeader title="Talent 지표">
        <OpsTalentMetricsWorkspace />
      </OpsShell>
    </>
  );
}
