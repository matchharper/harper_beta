import AppLayout from "@/components/layout/app";
import { supabase } from "@/lib/supabase";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import type { Database } from "@/types/database.types";
import { dateToFormatLong } from "@/utils/textprocess";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useMemo, useState, useEffect } from "react";
import { showToast } from "@/components/toast/toast";
import { MAX_ACTIVE_AUTOMATIONS } from "./[id]";
import CandidateViews from "@/components/CandidateViews";
import { useAutomationResults } from "@/hooks/useAutomationResults";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Loading } from "@/components/ui/loading";
import { useMessages } from "@/i18n/useMessage";

type AutomationRow = Database["public"]["Tables"]["automation"]["Row"];
const PAGE_SIZE = 10;

async function fetchAutomations(userId: string) {
  const { data, error } = await supabase
    .from("automation")
    .select("id, title, created_at, last_updated_at, is_in_progress, is_deleted")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AutomationRow[];
}

async function fetchActiveAutomationCount(userId: string) {
  const { count, error } = await supabase
    .from("automation")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .eq("is_in_progress", true);

  if (error) throw error;
  return count ?? 0;
}

export default function AutomationIndexPage() {
  const router = useRouter();
  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { m } = useMessages();

  const { data, isLoading } = useQuery({
    queryKey: ["automation", userId],
    queryFn: () => fetchAutomations(userId!),
    enabled: !!userId,
    staleTime: 20_000,
  });

  const items = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (expandedId && !items.find((item) => item.id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, items]);

  const handleAddAutomation = async () => {
    if (!userId) return;
    try {
      const activeCount = await fetchActiveAutomationCount(userId);
      if (activeCount >= MAX_ACTIVE_AUTOMATIONS) {
        showToast({
          message: m.scout.limitMessage,
          variant: "white",
        });
        return;
      }
      router.push("/my/scout/new");
    } catch {
      showToast({
        message: m.scout.checkAutomationFail,
        variant: "white",
      });
    }
  };

  return (
    <AppLayout initialCollapse={false}>
      <div className="min-h-screen w-full text-white">
        {
          items.length !== 0 && (
            <div className="sticky top-0 z-40 w-full backdrop-blur bg-hgray200/60">
              <div className="mx-auto w-full px-4 pt-6 pb-4 flex items-end justify-between gap-4">
                <div className="w-full">
                  <div className="flex flex-row items-center justify-between">
                    <div className="text-3xl font-hedvig font-light tracking-tight text-white">
                      {m.scout.title}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddAutomation}
                      className="min-w-[280px] rounded-lg border border-white/10 bg-accenta1/90 py-3 text-sm font-medium text-black transition hover:bg-accenta1"
                    >
                      {m.scout.addAgent}
                    </button>

                  </div>
                  <div className="mt-4 text-sm text-xgray800 whitespace-pre-line">
                    {m.scout.intro}
                  </div>
                </div>
              </div>
            </div>
          )
        }
        {!isLoading && items.length === 0 && (
          <div className="mx-4 mt-6">
            <div className="flex min-h-[72vh] flex-col items-center justify-center px-6 py-14 text-center">
              {/* <div className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] tracking-wide text-white/70">
                {m.scout.emptyTag}
              </div> */}

              <div className="text-2xl font-hedvig font-light tracking-tight text-white md:text-3xl">
                {m.scout.emptyTitle}
              </div>

              <div className="mt-3 text-sm text-white/60 md:text-base">
                {m.scout.emptySubtitle}
              </div>

              <div className="mt-6 max-w-[590px] space-y-2 text-sm leading-relaxed text-white/55">
                <div>{m.scout.emptyDesc}</div>
                <div>{m.scout.emptyDesc2}</div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-white/75">
                <span className="text-white/45">{m.scout.feedbackPrefix}</span>

                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                  <Check className="h-4 w-4 text-white/60" />
                  {m.scout.feedbackPositive}
                </span>

                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                  <X className="h-4 w-4 text-white/60" />
                  {m.scout.feedbackNegative}
                </span>

                <span className="text-white/45">{m.scout.feedbackSuffix}</span>
              </div>

              <button
                type="button"
                onClick={handleAddAutomation}
                className="mt-8 inline-flex items-center justify-center rounded-full border border-white/15 bg-accenta1 px-6 py-3 text-sm font-medium text-black transition"
              >
                {m.scout.createAgent}
              </button>

              <div className="mt-4 text-sm text-white/40">
                {m.scout.perAgentNote}
              </div>
            </div>
          </div>
        )}


        {items.length > 0 && (
          <div className="mx-auto w-full px-4 pb-16 mt-8">
            {isLoading && (
              <div className="py-8 text-sm text-xgray800"><Loading label={m.scout.loadingList} className="text-xgray800" isFullScreen={true} /></div>
            )}

            <div className="grid grid-cols-3 gap-4 mt-8">
              {items.map((item) => {
                const updatedAt = item.last_updated_at || item.created_at;
                const statusLabel = item.is_in_progress
                  ? m.scout.statusRunning
                  : m.scout.statusStopped;
                const isExpanded = expandedId === item.id;
                return (
                  <div key={item.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setExpandedId((prev) =>
                          prev === item.id ? null : item.id
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        setExpandedId((prev) =>
                          prev === item.id ? null : item.id
                        );
                      }}
                      className={`relative flex flex-col gap-1 border border-white/0 rounded-lg bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 ${isExpanded ? "border-accenta1" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="text-base font-medium text-white">
                          {item.title ?? m.scout.itemFallbackTitle} #{item.id.slice(0, 6)}
                        </div>
                        <span
                          className={[
                            "rounded-full text-xs",
                            item.is_in_progress
                              ? " text-green-300"
                              : " text-amber-300",
                          ].join(" ")}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="text-xs text-xgray800 mt-4">
                        {m.scout.createdAt} {dateToFormatLong(item.created_at)}
                      </div>
                      <div className="text-xs text-xgray800">
                        {m.scout.updatedAt} {dateToFormatLong(updatedAt)}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/my/scout/${item.id}`);
                        }}
                        className="absolute right-3 bottom-3 rounded-md bg-accenta1 px-3 py-1.5 text-xs text-black transition hover:bg-accenta1/80"
                      >
                        {m.scout.edit}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {expandedId && (
              <div className="mt-8">
                <AutomationResultsList
                  userId={userId}
                  automationId={expandedId}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function AutomationResultsList({
  userId,
  automationId,
}: {
  userId?: string;
  automationId: string;
}) {
  const [pageIdx, setPageIdx] = useState(0);

  useEffect(() => {
    setPageIdx(0);
  }, [automationId]);

  const { data, isLoading, error, isFetching } = useAutomationResults(
    userId,
    automationId,
    pageIdx,
    PAGE_SIZE
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasNext = data?.hasNext ?? false;
  const hasPrev = pageIdx > 0;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isLoading) return <Loading className="text-xgray800" />;
  if (error)
    return <div className="text-sm text-red-400">불러오지 못했습니다.</div>;

  if (items.length === 0) {
    return <div className="text-sm text-xgray800">추천된 후보자가 없습니다.</div>;
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex flex-row items-center gap-3 text-sm text-hgray900">
          <span>Page</span>
          <span className={`rounded-md p-1 bg-white/5 ${!hasPrev || isFetching ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`} onClick={() => setPageIdx((p) => Math.max(0, p - 1))}><ChevronLeft size={16} className="text-accenta1" /></span>
          <span className="font-medium">{pageIdx + 1}</span> /{" "}
          <span className="font-medium">{pageCount}</span>{" "}
          <span className={`rounded-md p-1 bg-white/5 ${!hasNext || isFetching ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`} onClick={() => {
            if (!hasNext) return;
            setPageIdx((p) => p + 1);
          }}><ChevronRight size={16} className="text-accenta1" /></span>
          {isFetching && <span className="ml-2 text-hgray500">Syncing…</span>}
        </div>
      </div>

      <CandidateViews
        items={items}
        userId={userId ?? ""}
        isMyList={true}
        criterias={[]}
      />
    </div>
  );
}
