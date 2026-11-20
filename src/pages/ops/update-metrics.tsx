import Head from "next/head";
import OpsShell from "@/components/ops/OpsShell";
import OpsUpdateMetricsWorkspace from "@/components/ops/metrics/OpsUpdateMetricsWorkspace";

export default function OpsUpdateMetricsPage() {
  return (
    <>
      <Head>
        <title>업데이트 지표 · Harper Ops</title>
      </Head>
      <OpsShell compactHeader title="업데이트 지표">
        <OpsUpdateMetricsWorkspace />
      </OpsShell>
    </>
  );
}
