import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { Input } from "@/components/ui/input";
import { MuteButton } from "@/components/ui/button";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { getHistoryOpportunityBucket, isSavedHistoryOpportunity } from "@/hooks/career/careerSessionData";
import { filterOpportunitySearchItems, type OpportunitySearchItem } from "@/lib/career/opportunitySearch";
import OpportunityResultRow from "./OpportunityResultRow";
import { getCareerDefaultSavedStageForOpportunity } from "../opportunityTypeMeta";
import { getCareerOpportunityManagementStatusLabel } from "./savedOpportunityStatus";

type Props = {
  scope: "new" | "mine";
  userId?: string;
  items: OpportunitySearchItem[];
  complete: boolean;
  onSelect: (item: OpportunitySearchItem) => void;
};

export default function OpportunitySearch({ scope, userId, items, complete, onSelect }: Props) {
  const t = useCareerT();
  const { locale } = useMessages();
  const { fetchWithAuth } = useCareerApi();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(30);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const label = scope === "new"
    ? t("career.history.search.new_title", "새 기회 검색")
    : t("career.history.search.title", "내 기회 검색");

  useEffect(() => {
    const handleFind = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey ||
        !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
      const dialog = event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (dialog && !dialog.contains(contentRef.current)) return;
      event.preventDefault();
      setOpen(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", handleFind);
    return () => window.removeEventListener("keydown", handleFind);
  }, []);

  const collection = useQuery({
    queryKey: ["career-opportunity-search", userId, locale, scope],
    enabled: open && !complete && Boolean(userId),
    queryFn: async ({ signal }): Promise<OpportunitySearchItem[]> => {
      const response = await fetchWithAuth(`/api/talent/opportunities/search?${new URLSearchParams({ locale, scope })}`, { signal });
      if (!response.ok) throw new Error("Failed to search opportunities");
      const payload = await response.json();
      return payload.items;
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const searchableItems = useMemo(() => {
    const merged = new Map((complete ? [] : collection.data ?? []).map((item) => [item.id, item]));
    for (const item of items) merged.set(item.id, item);
    return [...merged.values()].filter((item) => {
      const bucket = getHistoryOpportunityBucket(item);
      return scope === "new"
        ? bucket === "new"
        : isSavedHistoryOpportunity(item) || bucket === "archived";
    });
  }, [collection.data, complete, items, scope]);
  const results = useMemo(() => filterOpportunitySearchItems(searchableItems, query), [searchableItems, query]);
  const selectedIndex = Math.min(activeIndex, Math.max(0, results.length - 1));
  const loading = !complete && collection.isFetching;
  const failed = !complete && collection.isError;
  const count = String(results.length);
  const resultCountLabel = query.trim()
    ? t("career.history.search.results", "검색 결과 {count}개", { values: { count } })
    : scope === "new"
      ? t("career.history.search.new_collection", "새 기회 {count}개", { values: { count } })
      : t("career.history.search.collection", "내 기회 {count}개", { values: { count } });

  useEffect(() => {
    document.getElementById(`${listId}-${selectedIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, selectedIndex]);

  const select = (item: OpportunitySearchItem) => {
    setOpen(false);
    onSelect(item);
  };

  return (
    <>
      <TalentCareerModal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel={label}
        showCloseButton={false}
        overlayClassName="items-start pt-[12dvh] max-sm:pt-6"
        panelClassName="max-w-[600px] motion-reduce:animate-none"
        bodyClassName="p-0 sm:p-0"
      >
        <div ref={contentRef}>
          <div className="flex items-center gap-3 border-b border-neutral-1000-a10 px-4 py-3 transition-colors focus-within:border-neutral-400">
            <Search className="size-5 shrink-0 text-neutral-muted" />
            <Input
              ref={inputRef}
              autoFocus
              unstyled
              className="min-w-0 flex-1 bg-transparent py-1 text-base text-neutral-primary outline-none placeholder:text-neutral-placeholder"
              placeholder={t("career.history.search.placeholder", "회사, 포지션, 지역, 메모 검색")}
              aria-label={label}
              role="combobox"
              aria-expanded={true}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={results.length ? `${listId}-${selectedIndex}` : undefined}
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
                setVisibleCount(30);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const next = Math.max(0, Math.min(results.length - 1, selectedIndex + (event.key === "ArrowDown" ? 1 : -1)));
                  setActiveIndex(next);
                  setVisibleCount((count) => Math.max(count, next + 1));
                } else if (event.key === "Enter" && results[selectedIndex]) {
                  event.preventDefault();
                  select(results[selectedIndex]);
                }
              }}
            />
            <MuteButton variant="transparent" size="sm" aria-label={t("career.history.search.close", "검색 닫기")} onClick={() => setOpen(false)}>
              <X className="size-4" />
            </MuteButton>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-xs text-neutral-muted" role="status">
            <span>{resultCountLabel}</span>
            {loading ? <span className="flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" />{t("career.history.search.loading", "전체 기회 불러오는 중")}</span> : null}
          </div>
          {failed ? <div className="flex items-center justify-between gap-3 px-4 pb-3 text-sm text-critical" role="alert">
            {t("career.history.search.error", "전체 기회를 불러오지 못했어요.")}
            <MuteButton size="sm" onClick={() => void collection.refetch()}>{t("career.history.search.retry", "다시 시도")}</MuteButton>
          </div> : null}
          <div className="max-h-[min(55dvh,460px)] overflow-y-auto overscroll-contain px-2 pb-2">
            <div role="listbox" id={listId} aria-label={label} aria-busy={loading}>
            {results.slice(0, visibleCount).map((item, index) => {
              const status = isSavedHistoryOpportunity(item)
                ? item.savedStage ?? getCareerDefaultSavedStageForOpportunity({ ...item, isInternal: item.sourceType === "internal" })
                : "archived";
              return <OpportunityResultRow key={item.id} id={`${listId}-${index}`} role="option" aria-selected={index === selectedIndex}
                onClick={() => select(item)}
                onMouseMove={() => setActiveIndex(index)}
                active={index === selectedIndex}
                companyName={item.companyName}
                companyLogoUrl={item.companyLogoUrl}
                title={item.title}
                location={item.location}
                statusLabel={scope === "mine" ? getCareerOpportunityManagementStatusLabel(status, t) : undefined}
              />;
            })}
            </div>
            {results.length > visibleCount ? <div className="px-2 pb-1 pt-2"><MuteButton className="w-full" onClick={() => setVisibleCount((count) => count + 30)}>{t("career.history.search.more", "더 보기")}</MuteButton></div> : null}
          </div>
          {!results.length && !loading && !failed ? <div className="px-5 pb-12 pt-6 text-center text-sm text-neutral-muted">
            {query.trim()
              ? t("career.history.search.empty", "일치하는 기회가 없어요.")
              : scope === "new"
                ? t("career.history.search.no_new_items", "새 기회가 아직 없어요.")
                : t("career.history.search.no_items", "저장한 기회가 아직 없어요.")}
          </div> : null}
          <div className="hidden items-center gap-4 border-t border-neutral-1000-a05 px-4 py-2.5 text-[11px] text-neutral-soft sm:flex">
            <span>↑ ↓ {t("career.history.search.navigate", "이동")}</span>
            <span>↵ {t("career.history.search.open", "열기")}</span>
            <span className="ml-auto">esc {t("career.history.search.dismiss", "닫기")}</span>
          </div>
        </div>
      </TalentCareerModal>
    </>
  );
}
