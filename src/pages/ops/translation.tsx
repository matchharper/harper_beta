import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { notifyCareerTranslationDbPreviewChanged } from "@/i18n/careerTranslationPreviewEvents";
import type { Locale } from "@/i18n/useMessage";
import { isInternalEmail } from "@/lib/internalAccess";
import { supabase } from "@/lib/supabase";
import {
  TRANSLATION_CATEGORY_FILTER_OPTIONS,
  getTranslationCategory,
  normalizeTranslationCategoryFilter,
  type TranslationCategoryFilterId,
  type TranslationCategoryId,
} from "@/lib/translationCategories";
import { useAuthStore } from "@/store/useAuthStore";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";

type TranslationGridRow = {
  category: TranslationCategoryId;
  categoryLabel: string;
  description: string;
  en: string;
  key: string;
  ko: string;
  updatedAt: string;
  updatedBy: string;
};

type TranslationPage = {
  category: TranslationCategoryId | null;
  hasMore: boolean;
  limit: number;
  minKoLength: number | null;
  namespace: string;
  nextCursor: string | null;
  query: string | null;
  rows: TranslationGridRow[];
};

type EditedTranslationRow = {
  original: TranslationGridRow;
  row: TranslationGridRow;
};

const namespace = "career";
const pageSize = 50;
const collapsedTextareaHeight = 80;
const translationTextareaClass =
  "block w-full min-w-0 rounded-sm border border-neutral-1000-a05 bg-bg-default/80 px-2.5 py-2 text-sm leading-5 text-neutral-primary outline-none placeholder:text-neutral-placeholder focus:border-neutral-1000 focus:bg-bg-default";

type TextareaOverflowByLocale = {
  en: boolean;
  ko: boolean;
};

function buildApiEntries(rows: TranslationGridRow[]) {
  return rows.flatMap((row) => [
    {
      key: row.key,
      locale: "ko",
      status: "reviewed",
      value: row.ko,
    },
    {
      key: row.key,
      locale: "en",
      status: "draft",
      value: row.en,
    },
  ]);
}

function areRowsEqual(left: TranslationGridRow, right: TranslationGridRow) {
  return (
    left.description === right.description &&
    left.en === right.en &&
    left.ko === right.ko
  );
}

function parseMinKoLength(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function getTranslationScreenPath(row: TranslationGridRow) {
  if (row.category === "onboarding") return "/career/onboarding";
  if (row.category === "history") return "/career/history";
  if (row.category === "company") return "/career/watchlist";
  if (row.category === "profile" || row.category === "settings") {
    return "/career/profile";
  }
  return "/career";
}

function buildTranslationScreenHref(row: TranslationGridRow) {
  const params = new URLSearchParams({
    focusTranslationKey: row.key,
  });
  if (row.category === "settings") params.set("panel", "settings");
  return `${getTranslationScreenPath(row)}?${params.toString()}`;
}

function TranslationTextarea({
  expanded,
  locale,
  onChange,
  onOverflowChange,
  rowKey,
  value,
}: {
  expanded: boolean;
  locale: Locale;
  onChange: (key: string, locale: Locale, value: string) => void;
  onOverflowChange: (key: string, locale: Locale, overflowing: boolean) => void;
  rowKey: string;
  value: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expandedHeight, setExpandedHeight] = useState<number | null>(null);

  const measure = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (expanded) {
      textarea.style.height = "auto";
      const borderHeight = textarea.offsetHeight - textarea.clientHeight;
      const nextHeight = Math.ceil(
        Math.max(collapsedTextareaHeight, textarea.scrollHeight + borderHeight)
      );

      textarea.style.height = `${nextHeight}px`;
      setExpandedHeight((current) =>
        current === nextHeight ? current : nextHeight
      );
      onOverflowChange(
        rowKey,
        locale,
        nextHeight > collapsedTextareaHeight + 1
      );
      return;
    }

    textarea.style.height = "";
    setExpandedHeight((current) => (current === null ? current : null));
    onOverflowChange(
      rowKey,
      locale,
      textarea.scrollHeight > textarea.clientHeight + 1
    );
  }, [expanded, locale, onOverflowChange, rowKey]);

  useEffect(() => {
    measure();
  }, [measure, value]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(rowKey, locale, event.target.value)}
      className={cx(
        translationTextareaClass,
        "min-h-[80px]",
        expanded ? "resize-none overflow-hidden" : "h-[80px] resize-y"
      )}
      style={
        expanded && expandedHeight !== null
          ? { height: `${expandedHeight}px` }
          : undefined
      }
    />
  );
}

export default function OpsTranslationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const [editedRowsByKey, setEditedRowsByKey] = useState<
    Map<string, EditedTranslationRow>
  >(() => new Map());
  const [expandedRowsByKey, setExpandedRowsByKey] = useState<Set<string>>(
    () => new Set()
  );
  const [overflowingTextareasByKey, setOverflowingTextareasByKey] = useState<
    Map<string, TextareaOverflowByLocale>
  >(() => new Map());
  const [categoryFilter, setCategoryFilter] =
    useState<TranslationCategoryFilterId>("all");
  const [queryInputOverride, setQueryInputOverride] = useState<string | null>(
    null
  );
  const [appliedQueryOverride, setAppliedQueryOverride] = useState<
    string | null
  >(null);
  const [minKoLengthInputOverride, setMinKoLengthInputOverride] = useState<
    string | null
  >(null);
  const [appliedMinKoLengthOverride, setAppliedMinKoLengthOverride] = useState<
    number | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveInfo, setSaveInfo] = useState("");
  const routeQuery = useMemo(() => {
    const queryValue = router.query.query;
    const nextQuery = Array.isArray(queryValue) ? queryValue[0] : queryValue;
    return typeof nextQuery === "string" ? nextQuery : "";
  }, [router.query.query]);
  const routeMinKoLength = useMemo(() => {
    const rawValue = router.query.minKoLength;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    return typeof value === "string" ? value : "";
  }, [router.query.minKoLength]);
  const queryInput = queryInputOverride ?? routeQuery;
  const minKoLengthInput = minKoLengthInputOverride ?? routeMinKoLength;
  const normalizedQuery = (appliedQueryOverride ?? routeQuery).trim();
  const minKoLength =
    appliedMinKoLengthOverride ?? parseMinKoLength(routeMinKoLength);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const translationsQueryKey = useMemo(
    () => [
      "ops",
      "translations",
      namespace,
      categoryFilter,
      normalizedQuery,
      minKoLength,
    ],
    [categoryFilter, minKoLength, normalizedQuery]
  );

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getAccessToken();
      if (!token) throw new Error("로그인 세션을 확인할 수 없습니다.");

      return fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers ?? {}),
        },
      });
    },
    [getAccessToken]
  );

  const fetchTranslationPage = useCallback(
    async (cursor: string | null): Promise<TranslationPage> => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        namespace,
      });
      if (cursor) params.set("cursor", cursor);
      if (normalizedQuery) params.set("query", normalizedQuery);
      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }
      if (minKoLength !== null) {
        params.set("minKoLength", String(minKoLength));
      }

      const response = await fetchWithAuth(
        `/api/internal/translations?${params.toString()}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "번역 데이터를 불러오지 못했습니다.");
      }

      return payload as TranslationPage;
    },
    [categoryFilter, fetchWithAuth, minKoLength, normalizedQuery]
  );

  const translationsQuery = useInfiniteQuery({
    enabled: canFetchInternal && router.isReady,
    getNextPageParam: (lastPage: TranslationPage) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchTranslationPage(pageParam),
    queryKey: translationsQueryKey,
  });

  const handleSearch = useCallback(() => {
    const nextQuery = queryInput.trim();
    const nextMinKoLength = parseMinKoLength(minKoLengthInput);

    setSaveInfo("");
    setAppliedQueryOverride(nextQuery);
    setAppliedMinKoLengthOverride(nextMinKoLength);

    const nextRouterQuery = { ...router.query };
    if (nextQuery) {
      nextRouterQuery.query = nextQuery;
    } else {
      delete nextRouterQuery.query;
    }
    if (nextMinKoLength !== null) {
      nextRouterQuery.minKoLength = String(nextMinKoLength);
    } else {
      delete nextRouterQuery.minKoLength;
    }

    void router.replace(
      {
        pathname: router.pathname,
        query: nextRouterQuery,
      },
      undefined,
      { shallow: true }
    );
  }, [minKoLengthInput, queryInput, router]);

  const serverRows = useMemo(
    () => translationsQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [translationsQuery.data]
  );

  const originalRowsByKey = useMemo(
    () => new Map(serverRows.map((row) => [row.key, row])),
    [serverRows]
  );

  const rows = useMemo(
    () =>
      serverRows.map((row) => {
        const nextRow = editedRowsByKey.get(row.key)?.row ?? row;
        if (nextRow.category && nextRow.categoryLabel) return nextRow;

        const category = getTranslationCategory(nextRow.key);
        return {
          ...nextRow,
          category: category.id,
          categoryLabel: category.label,
        };
      }),
    [editedRowsByKey, serverRows]
  );

  const dirtyRows = useMemo(
    () =>
      Array.from(editedRowsByKey.values())
        .filter((edit) => !areRowsEqual(edit.row, edit.original))
        .map((edit) => edit.row),
    [editedRowsByKey]
  );

  const dirtyCount = useMemo(() => {
    return dirtyRows.length;
  }, [dirtyRows]);

  const handleChangeRow = useCallback(
    (key: string, locale: Locale, value: string) => {
      setSaveInfo("");
      setEditedRowsByKey((current) => {
        const existing = current.get(key);
        const original = existing?.original ?? originalRowsByKey.get(key);
        const base = existing?.row ?? original;
        if (!base || !original) return current;

        const nextRow: TranslationGridRow =
          locale === "ko" ? { ...base, ko: value } : { ...base, en: value };
        const next = new Map<string, EditedTranslationRow>(current);
        if (areRowsEqual(nextRow, original)) {
          next.delete(key);
        } else {
          next.set(key, { original, row: nextRow });
        }
        return next;
      });
    },
    [originalRowsByKey]
  );

  const handleTextareaOverflowChange = useCallback(
    (key: string, locale: Locale, overflowing: boolean) => {
      setOverflowingTextareasByKey((current) => {
        const existing = current.get(key) ?? { en: false, ko: false };
        if (existing[locale] === overflowing) return current;

        const nextEntry = { ...existing, [locale]: overflowing };
        const next = new Map(current);
        if (nextEntry.en || nextEntry.ko) {
          next.set(key, nextEntry);
        } else {
          next.delete(key);
        }
        return next;
      });
    },
    []
  );

  const toggleExpandedRow = useCallback((key: string) => {
    setExpandedRowsByKey((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (saving || dirtyRows.length === 0) return;

    setSaving(true);
    setError("");
    setSaveInfo("");

    try {
      const response = await fetchWithAuth(
        `/api/internal/translations?namespace=${namespace}`,
        {
          method: "PUT",
          body: JSON.stringify({ entries: buildApiEntries(dirtyRows) }),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "번역 데이터를 저장하지 못했습니다.");
      }

      setEditedRowsByKey((current) => {
        const next = new Map(current);
        dirtyRows.forEach((row) => next.delete(row.key));
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: translationsQueryKey });
      notifyCareerTranslationDbPreviewChanged();
      setSaveInfo(
        `${dirtyRows.length}개 문구를 저장했습니다. 로컬 파일 반영은 \`pnpm translation:pull\`로 진행합니다.`
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "번역 데이터를 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }, [dirtyRows, fetchWithAuth, queryClient, saving, translationsQueryKey]);

  const displayedError =
    error ||
    (translationsQuery.error instanceof Error
      ? translationsQuery.error.message
      : "");
  const loading = translationsQuery.isLoading;
  const loadedLabel = `${rows.length}${translationsQuery.hasNextPage ? "+" : ""}`;

  return (
    <>
      <Head>
        <title>Translations · Harper Ops</title>
      </Head>

      <OpsShell
        title="Translations"
        actions={
          <>
            <BareButton
              type="button"
              onClick={() => {
                setSaveInfo("");
                void queryClient.invalidateQueries({
                  queryKey: translationsQueryKey,
                });
              }}
              disabled={translationsQuery.isFetching || saving}
              className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
            >
              <RefreshCw
                className={cx(
                  "h-4 w-4",
                  translationsQuery.isFetching && "animate-spin"
                )}
              />
              새로고침
            </BareButton>
            <BareButton
              type="button"
              onClick={() => void handleSave()}
              disabled={loading || saving || dirtyCount === 0}
              className={cx(opsTheme.buttonPrimary, "h-9 px-3")}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              저장
              {dirtyCount > 0 ? ` ${dirtyCount}` : ""}
            </BareButton>
          </>
        }
      >
        <section className="flex flex-row gap-4 px-4">
          <div className={cx(opsTheme.panel, "w-full min-w-0 overflow-hidden")}>
            <div className="flex flex-col gap-3 border-b border-neutral-1000-a05 p-4">
              <div>
                <div className={opsTheme.eyebrow}>Namespace</div>
                <div className="mt-1 text-sm font-medium text-neutral-primary">
                  career · {loadedLabel} loaded · {pageSize} per page
                </div>
              </div>
              <div className="grid gap-2 lg:grid-cols-[180px_minmax(0,1fr)_180px_auto]">
                <label className="block">
                  <select
                    aria-label="카테고리"
                    value={categoryFilter}
                    onChange={(event) => {
                      setSaveInfo("");
                      setCategoryFilter(
                        normalizeTranslationCategoryFilter(event.target.value)
                      );
                    }}
                    className={opsTheme.input}
                  >
                    {TRANSLATION_CATEGORY_FILTER_OPTIONS.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                  <input
                    aria-label="검색"
                    value={queryInput}
                    onChange={(event) => {
                      setSaveInfo("");
                      setQueryInputOverride(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSearch();
                      }
                    }}
                    placeholder="한글, 영어 검색"
                    className={cx(opsTheme.input, "pl-9")}
                  />
                </label>
                <label className="flex items-center gap-2 rounded-md border border-neutral-1000-a05 bg-bg-default/80 px-3">
                  <span className="shrink-0 text-xs font-medium text-neutral-soft">
                    한글 길이 ≥
                  </span>
                  <input
                    aria-label="최소 한글 길이"
                    type="number"
                    min={1}
                    value={minKoLengthInput}
                    onChange={(event) => {
                      setSaveInfo("");
                      setMinKoLengthInputOverride(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSearch();
                      }
                    }}
                    placeholder="N"
                    className="h-11 min-w-0 flex-1 bg-transparent text-sm text-neutral-primary outline-none placeholder:text-neutral-placeholder"
                  />
                </label>
                <BareButton
                  type="button"
                  onClick={handleSearch}
                  disabled={saving}
                  className={cx(opsTheme.buttonSecondary, "h-11 px-4")}
                >
                  <Search className="h-4 w-4" />
                  검색
                </BareButton>
              </div>
            </div>

            {displayedError ? (
              <div className={cx(opsTheme.errorNotice, "m-4")}>
                {displayedError}
              </div>
            ) : null}
            {saveInfo ? (
              <div
                className={cx(
                  opsTheme.successNotice,
                  "m-4 flex items-center gap-2"
                )}
              >
                <Check className="h-4 w-4" />
                {saveInfo}
              </div>
            ) : null}

            {/* <div className="max-h-[calc(100svh-260px)] overflow-auto"> */}
            <div className="overflow-auto">
              <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-0 text-left text-sm">
                <colgroup>
                  <col className="w-[150px]" />
                  <col className="w-[39%]" />
                  <col className="w-[39%]" />
                  <col className="w-[120px]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-bg-default text-xs text-neutral-soft">
                  <tr>
                    <th className="border-b border-neutral-1000-a05 px-3 py-3 font-medium">
                      구분
                    </th>
                    <th className="border-b border-neutral-1000-a05 px-3 py-3 font-medium">
                      한글
                    </th>
                    <th className="border-b border-neutral-1000-a05 px-3 py-3 font-medium">
                      영어
                    </th>
                    <th className="border-b border-neutral-1000-a05 px-3 py-3 font-medium">
                      화면
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center text-neutral-muted"
                      >
                        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                        번역 데이터를 불러오는 중입니다.
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center text-neutral-muted"
                      >
                        검색 결과가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const isExpanded = expandedRowsByKey.has(row.key);
                      const overflowState = overflowingTextareasByKey.get(
                        row.key
                      );
                      const canToggleExpansion =
                        isExpanded ||
                        Boolean(overflowState?.ko || overflowState?.en);

                      return (
                        <tr key={row.key} className="align-top">
                          <td className="border-b border-neutral-1000-a05 px-3 py-3">
                            <span className="inline-flex rounded-md bg-bg-weak px-2 py-1 text-xs font-medium text-neutral-muted">
                              {row.categoryLabel}
                            </span>
                          </td>
                          <td className="border-b border-neutral-1000-a05 px-3 py-3">
                            <TranslationTextarea
                              expanded={isExpanded}
                              locale="ko"
                              rowKey={row.key}
                              value={row.ko}
                              onChange={handleChangeRow}
                              onOverflowChange={handleTextareaOverflowChange}
                            />
                          </td>
                          <td className="border-b border-neutral-1000-a05 px-3 py-3">
                            <TranslationTextarea
                              expanded={isExpanded}
                              locale="en"
                              rowKey={row.key}
                              value={row.en}
                              onChange={handleChangeRow}
                              onOverflowChange={handleTextareaOverflowChange}
                            />
                          </td>
                          <td className="border-b border-neutral-1000-a05 px-3 py-3">
                            <div className="flex flex-col items-start gap-2">
                              <a
                                href={buildTranslationScreenHref(row)}
                                target="_blank"
                                rel="noreferrer"
                                className={cx(
                                  opsTheme.buttonSecondary,
                                  "h-8 px-2.5 text-xs"
                                )}
                                title="실제 career 화면에서 이 문구를 inspect합니다."
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                보기
                              </a>
                              {canToggleExpansion ? (
                                <BareButton
                                  type="button"
                                  onClick={() => toggleExpandedRow(row.key)}
                                  className={cx(
                                    opsTheme.buttonSecondary,
                                    "h-8 px-2.5 text-xs"
                                  )}
                                  aria-expanded={isExpanded}
                                  title={isExpanded ? "문구 접기" : "문구 확장"}
                                >
                                  {isExpanded ? (
                                    <Minimize2
                                      className="h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                  ) : (
                                    <Maximize2
                                      className="h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                  )}
                                  {isExpanded ? "접기" : "확장"}
                                </BareButton>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              {!loading && rows.length > 0 ? (
                <div className="flex items-center justify-center border-t border-neutral-1000-a05 p-4">
                  {translationsQuery.hasNextPage ? (
                    <BareButton
                      type="button"
                      onClick={() => void translationsQuery.fetchNextPage()}
                      disabled={translationsQuery.isFetchingNextPage || saving}
                      className={cx(opsTheme.buttonSecondary, "h-9 px-4")}
                    >
                      {translationsQuery.isFetchingNextPage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      50개 더 불러오기
                    </BareButton>
                  ) : (
                    <span className="text-xs text-neutral-soft">
                      모든 결과를 불러왔습니다.
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </OpsShell>
    </>
  );
}
