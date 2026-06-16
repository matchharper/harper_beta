import OpsShell, { OPS_NAV_GROUPS } from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { ArrowRight } from "lucide-react";
import Head from "next/head";
import Link from "next/link";

export default function OpsOverviewPage() {
  const tools = OPS_NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({ ...item, groupLabel: group.label }))
  );

  return (
    <>
      <Head>
        <title>Harper Ops</title>
        <meta name="description" content="Harper internal operations hub" />
      </Head>

      <OpsShell
        compactHeader
        title="Operations Overview"
        description="내부 운영 화면을 시스템과 매칭 관리로 나눴습니다."
      >
        <></>
      </OpsShell>
    </>
  );
}
