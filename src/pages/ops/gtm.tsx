import Head from "next/head";
import OpsShell from "@/components/ops/OpsShell";
import GtmWorkspace from "@/components/ops/gtm/GtmWorkspace";
export default function OpsGtmPage() {
  return (
    <>
      <Head>
        <title>GTM · Harper Ops</title>
      </Head>
      <OpsShell spreadsheet>
        <GtmWorkspace />
      </OpsShell>
    </>
  );
}
