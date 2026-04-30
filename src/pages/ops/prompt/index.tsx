import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { usePromptList } from "@/hooks/usePromptAdmin";
import { ArrowRight } from "lucide-react";
import Head from "next/head";
import Link from "next/link";

export default function OpsPromptListPage() {
  const { data: prompts, isLoading } = usePromptList();

  return (
    <>
      <Head>
        <title>Prompts — Harper Ops</title>
      </Head>

      <OpsShell title="Prompt Management">
        {isLoading ? (
          <div className="px-4 font-geist text-sm text-beige900/60">
            로딩 중...
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {(prompts ?? []).map((p) => (
              <Link
                key={p.slug}
                href={`/ops/prompt/${p.slug}`}
                className={cx(
                  opsTheme.panel,
                  "group p-5 transition hover:-translate-y-0.5 hover:shadow-[0_28px_80px_rgba(89,57,24,0.1)]"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-geist text-[1rem] font-medium text-beige900">
                      {p.name}
                    </div>
                    <div className="mt-1 font-geist text-xs text-beige900/50">
                      {p.slug}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-beige900/35 transition group-hover:translate-x-0.5" />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {p.has_draft && (
                    <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 font-geist text-[11px] font-medium text-amber-800">
                      Draft
                    </span>
                  )}
                  {p.latest_version > 0 && (
                    <span className={opsTheme.badge}>v{p.latest_version}</span>
                  )}
                </div>

                <div className="mt-3 font-geist text-xs text-beige900/45">
                  {p.published_at
                    ? `Published ${new Date(p.published_at).toLocaleDateString("ko-KR")}`
                    : "미발행"}
                  {" · "}
                  Updated{" "}
                  {new Date(p.updated_at).toLocaleDateString("ko-KR")}
                </div>
              </Link>
            ))}
          </section>
        )}
      </OpsShell>
    </>
  );
}
