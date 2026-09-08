import OpsShell from "@/components/ops/OpsShell";
import OpsUtmWorkspace from "@/components/ops/utm/OpsUtmWorkspace";
import Head from "next/head";

export default function OpsUtmPage() {
  return (
    <>
      <Head>
        <title>UTM · Harper Ops</title>
        <meta
          name="description"
          content="Harper Career UTM acquisition analytics"
        />
      </Head>
      <OpsShell allowUtmViewer>
        <OpsUtmWorkspace />
      </OpsShell>
    </>
  );
}
