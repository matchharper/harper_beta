// career-i18n-skip-file: Local synthetic UX preview; no job or agent APIs.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  ListFilter,
  Search,
  X,
} from "lucide-react";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Typography } from "@/components/ui/typography";
import { TabBoxes } from "@/components/ui/tab-boxes";
import { Tabs } from "@/components/ui/tabs";
import {
  jobs,
  catalogue,
  lenses,
  fitLabels,
  salaryRange,
  salaryText,
  type ConceptId,
  type Job,
} from "./data";
import OpportunityCard from "../../history/OpportunityCard";
import { toOpportunity } from "./opportunityFixture";
import { Quiet, Picker, navigateTabs, type Context } from "./shared";
import s from "./Concepts.module.css";

type Props = {
  concept: ConceptId;
  ctx: Context;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  scoreView: boolean;
  onScoreViewChange: (value: boolean) => void;
  saved: string[];
  onSave: (ids: string[], force?: boolean) => void;
  openRequest: number;
  detail: (job: Job, onBack: () => void) => ReactNode;
};
export function BrowsePane({
  concept,
  ctx,
  expanded,
  setExpanded,
  scoreView,
  onScoreViewChange,
  saved,
  onSave,
  detail,
  openRequest,
}: Props) {
  const process = concept === "workspace" || concept === "interview";
  const [jobId, setJobId] = useState<string | null>(process ? "1" : null);
  useEffect(() => {
    if (!openRequest) return;
    setJobId(process ? "1" : null);
    const frame = requestAnimationFrame(() => {
      const main = root.current?.closest("main");
      main?.scrollTo(0, 0);
      tableRegion.current?.scrollTo(tablePosition.current);
      const title = process
        ? main?.querySelector<HTMLElement>(
            "[data-detail]:not([hidden]) [data-view-title]"
          )
        : main?.querySelector<HTMLElement>("h2");
      title?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [openRequest, process]);
  const [visited, setVisited] = useState<Job[]>(process ? [catalogue[0]] : []);
  const [category, setCategory] = useState("전체");
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [mode, setMode] = useState("근무 방식 전체");
  const [employment, setEmployment] = useState("고용 형태 전체");
  const [salary, setSalary] = useState("보상 전체");
  const [includeUnknown, setIncludeUnknown] = useState(true);
  const [savedOnly, setSavedOnly] = useState(false);
  const [sort, setSort] = useState("최근 확인순");
  const [selected, setSelected] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null),
    position = useRef(0),
    origin = useRef<HTMLElement | null>(null);
  const tableRegion = useRef<HTMLDivElement>(null);
  const tablePosition = useRef({ left: 0, top: 0 });
  const isMap = concept === "map" && expanded;
  const isCatalogue = concept === "explore" && expanded;
  const isTable = isMap || isCatalogue;
  const isMetrics = concept === "metrics";
  const canFilter = isCatalogue || isMetrics;
  const allItems = isCatalogue ? catalogue : catalogue.slice(0, jobs.length);
  const queryTerms = query
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const filtered = allItems
    .filter((j) => {
      if (category !== "전체" && !j.tags.includes(category)) return false;
      if (!canFilter) return true;
      const searchText =
        `${j.company} ${j.role} ${j.location} ${j.mode}${/forward deployed/i.test(j.role) ? " FDE" : ""}`
          .normalize("NFKC")
          .toLowerCase();
      const range = salaryRange(j);
      return (
        queryTerms.every((term) => searchText.includes(term)) &&
        (mode === "근무 방식 전체" || j.mode === mode) &&
        (employment === "고용 형태 전체" || j.type === employment) &&
        (!savedOnly || saved.includes(j.id)) &&
        (salary === "보상 전체" ||
          (range ? range.high >= 10000 : includeUnknown))
      );
    })
    .sort((a, b) =>
      !isCatalogue
        ? 0
        : sort === "회사명순"
          ? a.company.localeCompare(b.company, "ko")
          : sort === "보상 높은순"
            ? (salaryRange(b)?.high ?? -1) - (salaryRange(a)?.high ?? -1)
            : (b.checkedAt ?? "").localeCompare(a.checkedAt ?? "")
    );
  const visible =
    !isTable && !isMetrics && concept !== "categories"
      ? filtered.slice(0, 3)
      : filtered;
  const resultCount = isTable ? filtered.length : visible.length;
  const clearFilters = () => {
    setMode("근무 방식 전체");
    setEmployment("고용 형태 전체");
    setSalary("보상 전체");
    setIncludeUnknown(true);
    setSavedOnly(false);
  };
  const visibleIds = new Set(filtered.map((job) => job.id));
  const selectedVisible = selected.filter((id) => visibleIds.has(id)).length;
  const hiddenCount = selected.length - selectedVisible;
  const allSelectedSaved =
    selected.length > 0 && selected.every((id) => saved.includes(id));
  const clearSearch = () => {
    setQuery("");
    root.current
      ?.querySelector<HTMLInputElement>('input[type="search"]')
      ?.focus();
  };
  const toggleTable = (next: boolean) => {
    if (!next && tableRegion.current) {
      tablePosition.current = {
        left: tableRegion.current.scrollLeft,
        top: tableRegion.current.scrollTop,
      };
    }
    setExpanded(next);
    requestAnimationFrame(() => {
      root.current?.closest("main")?.scrollTo(0, 0);
      if (next) tableRegion.current?.scrollTo(tablePosition.current);
      root.current
        ?.querySelector<HTMLElement>(next ? "h2" : "[data-table-entry]")
        ?.focus({ preventScroll: true });
    });
  };
  const open = (job: Job) => {
    origin.current = document.activeElement as HTMLElement;
    position.current = root.current?.closest("main")?.scrollTop ?? 0;
    if (tableRegion.current) {
      tablePosition.current = {
        left: tableRegion.current.scrollLeft,
        top: tableRegion.current.scrollTop,
      };
    }
    if (!visited.some((j) => j.id === job.id)) setVisited((v) => [...v, job]);
    setJobId(job.id);
    requestAnimationFrame(() => {
      root.current?.closest("main")?.scrollTo(0, 0);
      root.current
        ?.querySelector<HTMLElement>(`[data-detail="${job.id}"] button`)
        ?.focus({ preventScroll: true });
    });
  };
  const back = () => {
    setJobId(null);
    requestAnimationFrame(() => {
      root.current?.closest("main")?.scrollTo(0, position.current);
      tableRegion.current?.scrollTo(tablePosition.current);
      (origin.current?.isConnected && root.current?.contains(origin.current)
        ? origin.current
        : root.current?.querySelector<HTMLElement>("h2")
      )?.focus({ preventScroll: true });
    });
  };
  const choose = (id: string) => {
    setSelected((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id]
    );
  };
  const activeFilters = [
    mode !== "근무 방식 전체"
      ? { name: mode, clear: () => setMode("근무 방식 전체") }
      : null,
    employment !== "고용 형태 전체"
      ? { name: employment, clear: () => setEmployment("고용 형태 전체") }
      : null,
    savedOnly
      ? { name: "저장한 공고", clear: () => setSavedOnly(false) }
      : null,
    salary !== "보상 전체"
      ? {
          name: `상단 1억 이상${includeUnknown ? " · 미확인 포함" : ""}`,
          clear: () => setSalary("보상 전체"),
        }
      : null,
  ].filter((v) => v !== null);

  return (
    <div ref={root}>
      <div
        hidden={!!jobId}
        className={`${s.browse} ${isTable ? s.tablePane : ""}`}
      >
        {isTable && (
          <div className={s.breadcrumb}>
            <Quiet onClick={() => toggleTable(false)}>
              <ArrowLeft size={13} /> 추천으로
            </Quiet>
          </div>
        )}
        <div className={s.paneTitle}>
          <Typography as="h2" variant="title" tabIndex={-1}>
            {isMap
              ? "함께 살펴볼 기회"
              : isCatalogue
                ? "전체 공고"
                : isMetrics
                  ? "추천 기회"
                  : "새 기회"}
            <span className={s.inlineCount} aria-live="polite">
              {resultCount}
              {isCatalogue && resultCount !== allItems.length
                ? ` / ${allItems.length}`
                : ""}
            </span>
          </Typography>
          {!expanded && (concept === "explore" || concept === "map") && (
            <Quiet
              data-table-entry
              className={s.browseEntry}
              onClick={() => toggleTable(true)}
            >
              {concept === "map" ? `${jobs.length}곳 비교` : "전체 공고 탐색"}
              <ChevronRight size={14} />
            </Quiet>
          )}
          {isMetrics && (
            <Quiet
              aria-expanded={showFilters}
              aria-controls={`concept-filters-${concept}`}
              onClick={() => setShowFilters((v) => !v)}
            >
              <ListFilter size={14} /> 필터
              {activeFilters.length ? ` ${activeFilters.length}` : ""}
            </Quiet>
          )}
        </div>
        {isMetrics && (
          <div className={s.fitOptions}>
            <span>적합도 표시</span>
            <Tabs
              aria-label="적합도 표시"
              variant="pills"
              size="small"
              activeValue={scoreView ? "score" : "reason"}
              onValueChange={(value) => onScoreViewChange(value === "score")}
              onKeyDown={navigateTabs}
              items={[
                { value: "reason", label: "이유" },
                { value: "score", label: "점수 예시" },
              ]}
            />
          </div>
        )}
        {concept === "categories" && (
          <>
            <TabBoxes
              variant="neutral"
              size="xs"
              aria-label="추천 관점"
              onKeyDown={navigateTabs}
              activeValue={category}
              onValueChange={setCategory}
              items={lenses.map((l) => ({
                value: l.value,
                label: l.label,
                count: allItems.filter(
                  (j) => l.value === "전체" || j.tags.includes(l.value)
                ).length,
              }))}
              listClassName="flex-wrap min-w-0 gap-1.5"
              itemClassName="h-8 min-w-0 text-xs"
            />
            {category !== "전체" && (
              <p className={s.lensDescription}>
                {lenses.find((l) => l.value === category)?.description}
              </p>
            )}
          </>
        )}
        {isCatalogue && (
          <div className={s.tableToolbar}>
            <div className={s.searchField}>
              <Search size={14} />
              <Input
                aria-label="공고 검색"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) clearSearch();
                }}
                placeholder="회사, 역할, 지역 검색"
              />
              {query && (
                <Quiet
                  className={s.clearSearch}
                  label="검색어 지우기"
                  onClick={clearSearch}
                >
                  <X size={14} />
                </Quiet>
              )}
            </div>
            <Quiet
              aria-expanded={showFilters}
              aria-controls={`concept-filters-${concept}`}
              onClick={() => setShowFilters((v) => !v)}
            >
              <ListFilter size={14} /> 필터
              {activeFilters.length ? ` ${activeFilters.length}` : ""}
            </Quiet>
            <Picker
              label="공고 정렬"
              value={sort}
              options={["최근 확인순", "보상 높은순", "회사명순"]}
              onChange={setSort}
            />
          </div>
        )}
        {canFilter && (
          <div
            id={`concept-filters-${concept}`}
            hidden={!showFilters}
            className={s.filters}
          >
            <div className={s.filterRow}>
              <Picker
                label="근무 방식"
                value={mode}
                options={["근무 방식 전체", "원격", "하이브리드", "대면"]}
                onChange={setMode}
              />
              <Picker
                label="고용 형태"
                value={employment}
                options={["고용 형태 전체", "풀타임", "파트타임"]}
                onChange={setEmployment}
              />
              <Picker
                label="보상 조건"
                value={salary}
                options={["보상 전체", "상단 1억원 이상"]}
                onChange={setSalary}
              />
            </div>
            {salary !== "보상 전체" && (
              <Checkbox
                label="보상 미확인 공고도 포함"
                checked={includeUnknown}
                onChange={(e) => setIncludeUnknown(e.target.checked)}
              />
            )}
            <Checkbox
              label={`저장한 공고만 · ${saved.filter((id) => allItems.some((j) => j.id === id)).length}`}
              checked={savedOnly}
              onChange={(e) => setSavedOnly(e.target.checked)}
            />
          </div>
        )}
        {canFilter && activeFilters.length > 0 && (
          <div className={s.activeFilters}>
            {activeFilters.map((f) => (
              <Quiet
                key={f.name}
                label={`${f.name} 필터 해제`}
                onClick={f.clear}
              >
                {f.name}
                <X size={11} />
              </Quiet>
            ))}
            {activeFilters.length > 1 && (
              <Quiet onClick={clearFilters}>필터 초기화</Quiet>
            )}
          </div>
        )}
        {isTable ? (
          <>
            {selected.length > 0 && (
              <div className={s.selectionBar} aria-live="polite">
                <span>
                  {selected.length}곳 선택
                  {hiddenCount > 0 && <small> · 화면 밖 {hiddenCount}곳</small>}
                </span>
                <Quiet
                  disabled={allSelectedSaved}
                  onClick={() => onSave(selected, true)}
                >
                  {allSelectedSaved ? (
                    <Check size={13} />
                  ) : (
                    <Bookmark size={13} />
                  )}
                  {allSelectedSaved ? "모두 저장됨" : "선택 저장"}
                </Quiet>
                <MuteButton
                  size="sm"
                  variant="dark"
                  onClick={() => {
                    const picked = allItems.filter((j) =>
                      selected.includes(j.id)
                    );
                    ctx.ask({
                      label:
                        picked.length === 1
                          ? picked[0].company
                          : `${picked[0].company} 외 ${picked.length - 1}곳`,
                      prompt:
                        picked.length === 1
                          ? "이 기회의 추천 이유와 확인할 점을 알려주세요."
                          : "선택한 기회의 추천 이유와 확인할 점을 비교해주세요.",
                      items: picked.map((j) => `${j.company} · ${j.role}`),
                    });
                  }}
                >
                  Harper에게 비교 요청 <ArrowRight size={12} />
                </MuteButton>
                <Quiet label="선택 해제" onClick={() => setSelected([])}>
                  <X size={13} />
                </Quiet>
              </div>
            )}
            {filtered.length > 0 && (
              <div
                className={s.tableViewport}
                ref={tableRegion}
                tabIndex={0}
                onScroll={(e) => {
                  if (jobId) return;
                  const table = e.currentTarget;
                  tablePosition.current = {
                    left: table.scrollLeft,
                    top: table.scrollTop,
                  };
                }}
                role="region"
                aria-label={isMap ? "추천 기회 비교표" : "전체 공고 표"}
              >
                <Table
                  className={`${s.dataTable} ${isMap ? s.comparisonTable : ""}`}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Checkbox
                          aria-label="현재 결과 모두 선택"
                          checked={
                            filtered.length > 0 &&
                            selectedVisible === filtered.length
                          }
                          indeterminate={
                            selectedVisible > 0 &&
                            selectedVisible < filtered.length
                          }
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelected((previous) =>
                              checked
                                ? [...new Set([...previous, ...visibleIds])]
                                : previous.filter((id) => !visibleIds.has(id))
                            );
                          }}
                        />
                      </TableHead>
                      <TableHead
                        aria-sort={
                          isCatalogue && sort === "회사명순"
                            ? "ascending"
                            : undefined
                        }
                      >
                        역할 · 회사
                      </TableHead>
                      {isMap ? (
                        <>
                          <TableHead>맞닿는 경험</TableHead>
                          <TableHead>확인할 점</TableHead>
                          <TableHead>근무</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead>근무</TableHead>
                          <TableHead
                            aria-sort={
                              sort === "보상 높은순" ? "descending" : undefined
                            }
                          >
                            보상 <small>만원/년</small>
                          </TableHead>
                          <TableHead>단계 · 규모</TableHead>
                          <TableHead
                            aria-sort={
                              sort === "최근 확인순" ? "descending" : undefined
                            }
                          >
                            확인일
                          </TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((j) => (
                      <TableRow
                        key={j.id}
                        data-state={
                          selected.includes(j.id) ? "selected" : undefined
                        }
                      >
                        <TableCell>
                          <Checkbox
                            aria-label={`${j.company} ${j.role} 선택`}
                            checked={selected.includes(j.id)}
                            onChange={() => choose(j.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <BareButton
                            className={s.tableJob}
                            onClick={() => open(j)}
                          >
                            <span>
                              {j.role}
                              {saved.includes(j.id) && (
                                <Bookmark size={10} fill="currentColor" />
                              )}
                            </span>
                            <small>{j.company}</small>
                          </BareButton>
                        </TableCell>
                        {isMap ? (
                          <>
                            <TableCell>{j.reason}</TableCell>
                            <TableCell className={s.concernCell}>
                              {j.concern}
                            </TableCell>
                            <TableCell>
                              {j.location}
                              <small>{j.mode}</small>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>
                              {j.location}
                              <small>
                                {j.mode}
                                {j.type === "파트타임" ? " · 파트타임" : ""}
                              </small>
                            </TableCell>
                            <TableCell className={s.salaryCell}>
                              {salaryText(j)}
                              {j.salary !== null && (
                                <small>{j.salaryKind}</small>
                              )}
                            </TableCell>
                            <TableCell>
                              {j.stage}
                              <small>{j.size}</small>
                            </TableCell>
                            <TableCell className={s.dateCell}>
                              {j.checkedAt}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        ) : (
          <div className={s.opportunityList}>
            {visible.map((j) => (
              <OpportunityCard
                key={j.id}
                item={toOpportunity(j)}
                expanded={false}
                showUnreadIndicator={false}
                onOpenDetail={() => open(j)}
                collapsedActions={
                  <Quiet
                    label={`${j.company} ${saved.includes(j.id) ? "저장 해제" : "저장"}`}
                    aria-pressed={saved.includes(j.id)}
                    onClick={() => onSave([j.id])}
                  >
                    <Bookmark
                      size={14}
                      fill={saved.includes(j.id) ? "currentColor" : "none"}
                    />
                  </Quiet>
                }
                collapsedFooter={
                  isMetrics ? (
                    <div className={s.cardMetrics}>
                      <span>
                        {scoreView
                          ? `적합도 ${j.score ?? "미평가"}`
                          : fitLabels[j.id]}
                      </span>
                      {saved.includes(j.id) && (
                        <span className={s.savedMarker}>
                          <Bookmark size={11} /> 저장됨
                        </span>
                      )}
                      <span>
                        {j.salary === null
                          ? "보상 미확인"
                          : `${j.salaryKind} ${salaryText(j)}만원/년`}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className={s.cardReason}>{j.reason}</p>
                      {saved.includes(j.id) && (
                        <span className={s.savedMarker}>
                          <Bookmark size={11} /> 저장됨
                        </span>
                      )}
                    </div>
                  )
                }
              />
            ))}
          </div>
        )}
        {filtered.length === 0 && (
          <div className={s.emptyState}>
            <Typography>
              {queryTerms.length
                ? `‘${query.trim()}’ 검색 결과가 없어요.`
                : savedOnly
                  ? "이 조건으로 저장한 공고가 없어요."
                  : "조건에 맞는 공고가 없어요."}
            </Typography>
            <div className={s.emptyActions}>
              {queryTerms.length > 0 && (
                <Quiet onClick={clearSearch}>검색어 지우기</Quiet>
              )}
              {activeFilters.length > 0 && (
                <Quiet onClick={clearFilters}>
                  필터 초기화 <ArrowRight size={12} />
                </Quiet>
              )}
            </div>
          </div>
        )}
      </div>
      {visited.map((job) => (
        <div key={job.id} data-detail={job.id} hidden={job.id !== jobId}>
          {detail(job, back)}
        </div>
      ))}
    </div>
  );
}
