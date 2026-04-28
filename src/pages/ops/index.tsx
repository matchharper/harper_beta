import OpsShell, { OPS_NAV_ITEMS } from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { ArrowRight } from "lucide-react";
import Head from "next/head";
import Link from "next/link";

export default function OpsOverviewPage() {
  const tools = OPS_NAV_ITEMS.filter((item) => item.href !== "/ops");

  return (
    <>
      <Head>
        <title>Harper Ops</title>
        <meta name="description" content="Harper internal operations hub" />
      </Head>

      <OpsShell
        compactHeader
        title="Operations Overview"
        description="내부적으로 봐야 하는 기능들을 `/ops` 아래 여러 페이지로 나눴습니다. 네트워크 리드와 request access 리뷰를 여기서 이동하면 됩니다."
      >
        <section className="grid gap-4 xl:grid-cols-2">
          {tools.map((tool) => {
            const Icon = tool.icon;

            return (
              <Link
                key={tool.href}
                href={tool.href}
                className={cx(
                  opsTheme.panel,
                  "group p-5 transition hover:-translate-y-0.5 hover:shadow-[0_28px_80px_rgba(89,57,24,0.1)]"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="rounded-md bg-beige500/70 p-3 text-beige900">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-beige900/35 transition group-hover:translate-x-0.5" />
                </div>

                <div className="mt-5 font-geist text-[1rem] font-medium leading-6 text-beige900">
                  {tool.label}
                </div>
                <div className="mt-2 font-geist text-sm leading-6 text-beige900/65">
                  {tool.description}
                </div>
              </Link>
            );
          })}
        </section>

        <section className={cx(opsTheme.panel, "p-5")}>
          <div className={opsTheme.eyebrow}>Routing</div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Link
              href="/ops/network"
              className={cx(
                opsTheme.panelSoft,
                "block px-4 py-4 font-geist text-sm text-beige900 transition hover:bg-white/80"
              )}
            >
              <div className="font-semibold">/ops/network</div>
              <div className="mt-1 text-beige900/55">
                network.tsx 제출 리드 조회
              </div>
            </Link>
            <Link
              href="/ops/opportunities"
              className={cx(
                opsTheme.panelSoft,
                "block px-4 py-4 font-geist text-sm text-beige900 transition hover:bg-white/80"
              )}
            >
              <div className="font-semibold">/ops/opportunities</div>
              <div className="mt-1 text-beige900/55">
                회사·기회 관리와 수동 매칭
              </div>
            </Link>
            <Link
              href="/ops/request-access"
              className={cx(
                opsTheme.panelSoft,
                "block px-4 py-4 font-geist text-sm text-beige900 transition hover:bg-white/80"
              )}
            >
              <div className="font-semibold">/ops/request-access</div>
              <div className="mt-1 text-beige900/55">
                request access 리뷰 진입 허브
              </div>
            </Link>
            <Link
              href="/ops/request-access/review"
              className={cx(
                opsTheme.panelSoft,
                "block px-4 py-4 font-geist text-sm text-beige900 transition hover:bg-white/80"
              )}
            >
              <div className="font-semibold">/ops/request-access/review</div>
              <div className="mt-1 text-beige900/55">
                승인 메일 draft 확인 및 발송
              </div>
            </Link>
          </div>

          <div className={cx(opsTheme.panelMuted, "mt-4 px-4 py-4")}>
            <div className={opsTheme.eyebrow}>Design Rule</div>
            <div className="mt-2 font-geist text-sm leading-6 text-beige900/65">
              `/ops` 화면은 [src/pages/index.tsx]의 베이지 톤을 기준으로 맞춥니다.
              세부 규칙은 `src/pages/ops/OPS_DESIGN.md`에 정리했습니다.
            </div>
          </div>
        </section>
      </OpsShell>
    </>
  );
}
