// components/chat/ChatMessageList.tsx
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type {
  CriteriaCardBlock,
  ToolStatusBlock,
  FileContextBlock,
  SettingsCtaBlock,
  SearchResultBlock,
  SearchStartBlock,
  SearchStartStatus,
} from "@/types/chat";
import {
  Bolt,
  Check,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Loader2,
  Plus,
  Pin,
  Paperclip,
  ArrowRight,
  Pencil,
  X,
} from "lucide-react";
import { useRouter } from "next/router";
import { LinkChip } from "../information/LinkChips";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  ENABLED_SEARCH_SOURCE_VALUES,
  EnabledSearchSource,
  getSearchSourceLabel,
  getSearchSourceLogoPath,
  normalizeSearchSources,
} from "@/lib/searchSource";
import { useRunDetail } from "@/hooks/useRunDetail";

const DEFAULT_CRITERIA_CARD_SOURCES: EnabledSearchSource[] = ["linkedin"];

type CriteriaItemProps = {
  criteria: string;
  onRemove: () => void;
  onConfirm: (next: string) => void;

  startEditing?: boolean;
  placeholder?: string;
  autoRemoveIfEmpty?: boolean;
  onCancel?: () => void;
};

export const CriteriaItem = React.memo(function CriteriaItem({
  criteria,
  onRemove,
  onConfirm,
  startEditing,
  placeholder = "Add criteria...",
  autoRemoveIfEmpty,
  onCancel,
}: CriteriaItemProps) {
  const [isEditing, setIsEditing] = useState(!!startEditing);
  const [draft, setDraft] = useState(criteria);
  const [isChanged, setIsChanged] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) setDraft(criteria);
  }, [criteria, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      const v = inputRef.current?.value ?? "";
      inputRef.current?.setSelectionRange(v.length, v.length);
    }, 0);
    return () => clearTimeout(t);
  }, [isEditing]);

  const cancel = () => {
    // ✅ If this is a "new item" row and user cancels, remove it entirely
    if (autoRemoveIfEmpty) {
      onCancel?.();
      return;
    }
    setDraft(criteria);
    setIsEditing(false);
  };

  const commit = () => {
    const v = draft.trim();
    if (!v) return cancel();
    onConfirm(v);
    setIsEditing(false);
  };

  useEffect(() => {
    if (!isEditing) return;

    const onMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) cancel();
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isEditing, criteria, draft]);

  return (
    <div
      ref={rootRef}
      onClick={() => {
        if (!isEditing) setIsEditing(true);
      }}
      className={`relative flex items-center gap-2 rounded-2xl text-[13px] font-light px-3 pt-2 group cursor-pointer hover:bg-white/5 transition-all duration-200
          ${
            isEditing
              ? "border border-white/5 bg-white/5 pb-4"
              : "border border-white/0 pb-2"
          }
          `}
    >
      {!isEditing ? (
        <div className="flex flex-row items-center justify-between gap-2 w-full">
          <span className="text-hgray900">{criteria}</span>
          <Pencil strokeWidth={1.6} className="w-2.5 h-2.5 text-hgray900/50" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-[-4px] right-[0px] text-xs opacity-0 group-hover:opacity-100 transition-all duration-200 text-hgray700 hover:text-hgray900"
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => {
              setDraft(e.target.value);
              setIsChanged(e.target.value !== criteria);
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            className="w-full bg-transparent outline-none text-hgray900 pr-14"
          />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              commit();
            }}
            className={`absolute bottom-1 right-2 text-xs opacity-100 transition-all duration-200
                ${
                  // ✅ Add-mode should be enabled when there's text
                  autoRemoveIfEmpty
                    ? draft.trim()
                      ? "text-accenta1"
                      : "text-hgray600"
                    : isChanged
                      ? "text-accenta1"
                      : "text-hgray600"
                }
                `}
          >
            Confirm
          </button>
        </>
      )}
    </div>
  );
});

type QueryTextItemProps = {
  text: string;
  onConfirm: (next: string) => void;
  placeholder?: string;
};

const QueryTextItem = React.memo(function QueryTextItem({
  text,
  onConfirm,
  placeholder = "검색 query를 입력하세요.",
}: QueryTextItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [isChanged, setIsChanged] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft(text);
      setIsChanged(false);
    }
  }, [text, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      const v = inputRef.current?.value ?? "";
      inputRef.current?.setSelectionRange(v.length, v.length);
    }, 0);
    return () => clearTimeout(t);
  }, [isEditing]);

  const cancel = () => {
    setDraft(text);
    setIsChanged(false);
    setIsEditing(false);
  };

  const commit = () => {
    const v = draft.trim();
    if (!v) return cancel();
    onConfirm(v);
    setIsEditing(false);
  };

  useEffect(() => {
    if (!isEditing) return;

    const onMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) cancel();
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isEditing, text, draft]);

  return (
    <div
      ref={rootRef}
      onClick={() => {
        if (!isEditing) setIsEditing(true);
      }}
      className={`relative mt-2 rounded-2xl px-3 pt-2 transition-all duration-200 cursor-pointer hover:bg-white/5
        ${isEditing ? "border border-white/5 bg-white/5 pb-6" : "border border-white/0 pb-2"}`}
    >
      {!isEditing ? (
        <div
          className={`text-[13px] whitespace-pre-wrap leading-relaxed ${
            text ? "text-hgray700" : "text-hgray600"
          }`}
        >
          {text || placeholder}
        </div>
      ) : (
        <>
          <textarea
            ref={inputRef}
            value={draft}
            rows={3}
            onChange={(e) => {
              setDraft(e.target.value);
              setIsChanged(e.target.value !== text);
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            className="w-full resize-none bg-transparent outline-none text-xs text-hgray900 leading-relaxed pr-14"
          />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              commit();
            }}
            className={`absolute bottom-2 right-2 text-xs transition-all duration-200 ${
              isChanged ? "text-accenta1" : "text-hgray600"
            }`}
          >
            Confirm
          </button>
        </>
      )}
    </div>
  );
});

function SourceIcons({ sources }: { sources: EnabledSearchSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {sources.map((source) => (
        <span
          key={source}
          className="flex items-center justify-center p-1 rounded-full bg-white"
        >
          <Image
            src={getSearchSourceLogoPath(source)}
            alt={getSearchSourceLabel(source)}
            width={12}
            height={12}
            className="object-contain"
          />
        </span>
      ))}
    </div>
  );
}

export const CriteriaCard = React.memo(function CriteriaCard({
  block,
  onConfirm,
  onChange,
  disabled = false,
}: {
  block: CriteriaCardBlock;
  onConfirm?: (b: CriteriaCardBlock) => void;
  onChange?: (b: CriteriaCardBlock) => void;
  disabled?: boolean;
}) {
  const [pendingAdd, setPendingAdd] = React.useState(false);
  const [sourcesMenuOpen, setSourcesMenuOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<CriteriaCardBlock>({
    ...block,
    sources: normalizeSearchSources(block.sources, {
      enabledOnly: true,
      fallback: DEFAULT_CRITERIA_CARD_SOURCES,
    }),
  });

  useEffect(() => {
    setDraft({
      ...block,
      sources: normalizeSearchSources(block.sources, {
        enabledOnly: true,
        fallback: DEFAULT_CRITERIA_CARD_SOURCES,
      }),
    });
  }, [block]);

  const updateDraft = (next: CriteriaCardBlock) => {
    onChange?.(next);
    setDraft(next);
  };

  const updateCriteriaAt = (idx: number, value: string) => {
    const next = [...(draft.criteria ?? [])];
    next[idx] = value;
    updateDraft({ ...draft, criteria: next });
  };

  const removeCriteriaAt = (idx: number) => {
    const next = [...(draft.criteria ?? [])].filter((_, i) => i !== idx);
    updateDraft({ ...draft, criteria: next });
  };

  const commitAdd = (value: string) => {
    const v = value.trim();
    if (!v) {
      setPendingAdd(false);
      return;
    }
    const next = [...(draft.criteria ?? []), v];
    updateDraft({ ...draft, criteria: next });
    setPendingAdd(false);
  };

  const cancelAdd = () => {
    setPendingAdd(false);
  };

  const updateQueryText = (value: string) => {
    const next = { ...draft, thinking: value };
    updateDraft(next);
  };

  const selectedSources = normalizeSearchSources(draft.sources, {
    enabledOnly: true,
    fallback: DEFAULT_CRITERIA_CARD_SOURCES,
  }) as EnabledSearchSource[];

  const toggleSource = (source: EnabledSearchSource) => {
    const nextSources = selectedSources.includes(source)
      ? selectedSources.filter((item) => item !== source)
      : [...selectedSources, source];

    if (nextSources.length === 0) return;

    updateDraft({
      ...draft,
      sources: nextSources,
    });
  };

  return (
    <div className="mt-2 w-full">
      <div className="max-w-[440px]">
        <div className="text-xs text-hgray600 font-extralight flex flex-row items-center gap-1.5">
          <span>
            <Bolt className="w-2.5 h-2.5 text-hgray600" />
          </span>
          Search
        </div>
        <div
          className={`mt-2 rounded-3xl border border-white/10 bg-white/5 px-4 py-4 transition-all duration-200
        ${disabled ? "pointer-events-none cursor-default" : ""}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm text-hgray900 font-semibold flex items-center gap-2">
              검색 방법
            </div>
          </div>

          <QueryTextItem
            text={draft.thinking ?? ""}
            onConfirm={updateQueryText}
          />

          <div className="mt-3 text-xs text-hgray600">Sources</div>

          <div className="flex flex-row gap-1 items-center justify-between">
            <div className="text-sm text-white font-light">
              검색에 사용할 소스
            </div>

            <DropdownMenu
              open={sourcesMenuOpen}
              onOpenChange={setSourcesMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full pr-3 pl-2.5 py-1.5 text-sm bg-white/5 border border-white/10 text-hgray900 transition-all duration-200 hover:bg-white/10"
                >
                  <SourceIcons sources={selectedSources} />
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-[220px] rounded-2xl border-white/10 bg-ngray300/70 p-2 backdrop-blur-sm"
              >
                <div className="px-1 pb-2 text-[11px] text-hgray700">
                  검색에 사용할 소스를 선택하세요.
                </div>
                <div className="flex flex-col gap-1">
                  {ENABLED_SEARCH_SOURCE_VALUES.map((source) => {
                    const checked = selectedSources.includes(source);
                    return (
                      <button
                        key={source}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleSource(source);
                        }}
                        className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all duration-200 ${
                          checked ? "bg-white/10" : "hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-hgray900">
                          <Image
                            src={getSearchSourceLogoPath(source)}
                            alt={getSearchSourceLabel(source)}
                            width={14}
                            height={14}
                            className="object-contain"
                          />
                          <span>{getSearchSourceLabel(source)}</span>
                        </div>
                        <div className="relative h-3.5 w-3.5 shrink-0 overflow-hidden">
                          <Check
                            className={`absolute inset-0 h-3.5 w-3.5 text-accenta1 transition-all duration-200 ${
                              checked
                                ? "opacity-100 translate-y-0 group-hover:opacity-0 group-hover:-translate-y-1.5"
                                : "pointer-events-none opacity-0 translate-y-1.5"
                            }`}
                          />
                          <ChevronDown
                            className={`absolute inset-0 h-3.5 w-3.5 text-hgray700 transition-all duration-200 ${
                              checked
                                ? "opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0"
                                : "pointer-events-none opacity-0 translate-y-1.5"
                            }`}
                          />
                          <ChevronUp
                            className={`absolute inset-0 h-3.5 w-3.5 text-hgray700 transition-all duration-200 ${
                              checked
                                ? "pointer-events-none opacity-0 -translate-y-1.5"
                                : "opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0"
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-3 text-xs text-hgray600">Criteria</div>

          {Array.isArray(draft.criteria) && draft.criteria.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {draft.criteria.map((c, idx) => (
                <CriteriaItem
                  key={`${idx}`}
                  criteria={c}
                  onRemove={() => removeCriteriaAt(idx)}
                  onConfirm={(next) => updateCriteriaAt(idx, next)}
                />
              ))}
            </div>
          )}

          {pendingAdd && (
            <div className="mt-2">
              <CriteriaItem
                criteria=""
                startEditing
                autoRemoveIfEmpty
                placeholder="Add criteria..."
                onRemove={cancelAdd}
                onCancel={cancelAdd}
                onConfirm={(next) => commitAdd(next)}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (!pendingAdd) setPendingAdd(true);
            }}
            className="rounded-2xl font-light hover:bg-white/5 pl-2 pr-3 py-2 text-sm text-hgray900 flex items-center gap-1 mt-4 transition-all duration-200"
          >
            <Plus size={16} />
            Add Criteria
          </button>

          <button
            type="button"
            className={`mt-4 w-full rounded-full bg-accenta1 text-black py-2.5 text-sm hover:opacity-90 disabled:opacity-50 ${
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            }`}
            disabled={disabled}
            // disabled={!draft.ready || disabled}
            onClick={() => onConfirm?.(draft)}
          >
            Confirm & Search
          </button>
        </div>
      </div>
    </div>
  );
});

export const CriteriaLoading = React.memo(function CriteriaLoading() {
  return (
    <div className="relative mt-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-4 overflow-hidden">
      {/* shimmer layer */}
      <div className="pointer-events-none absolute inset-0 shimmer-bg" />

      <div className="relative text-sm text-hgray900 font-normal">
        후보자를 찾을 방법을 설계하고 있습니다...
      </div>
    </div>
  );
});

export const ToolStatusCard = React.memo(function ToolStatusCard({
  name,
  state = "running",
  message,
}: ToolStatusBlock) {
  const label =
    name === "web_search"
      ? "웹 검색"
      : name === "website_scraping"
        ? "필요한 정보를 읽고 있습니다"
        : "도구 실행";

  if (state === "done") {
    return (
      <div className="w-full text-xs text-hgray700 flex flex-row items-center gap-1">
        <Check size={12} /> {label} 완료
      </div>
    );
  }

  // if (state === "error") {
  //   return (
  //     <div className="w-full text-xs text-red-400 flex flex-row items-center gap-1">
  //       <AlertTriangle size={12} /> 실패{message ? `: ${message}` : ""}
  //     </div>
  //   );
  // }

  return (
    <div className="w-full text-xs text-hgray600 flex items-center gap-1 mt-2">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      {label}...
    </div>
  );
});

export const ToolStatusToggle = React.memo(function ToolStatusToggle({
  items,
}: {
  items: ToolStatusBlock[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full mt-1 mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-hgray700 flex flex-row items-center gap-1 group"
      >
        <Check size={12} />
        검색 완료
        <span className="text-hgray600 group-hover:text-hgray900 transition-all duration-200">
          {open ? "접기" : "보기"}
        </span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {items.map((s, idx) => (
            <ToolStatusCard key={`${s.id ?? s.name ?? "tool"}-${idx}`} {...s} />
          ))}
        </div>
      )}
    </div>
  );
});

export const formatBytes = React.memo(function formatBytes(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
});

export const DocumentCard = React.memo(function DocumentCard({
  title,
  url,
  excerpt,
  label,
}: {
  title?: string;
  url?: string;
  excerpt?: string;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayText = excerpt ?? "";
  const hasText = displayText.trim().length > 0;

  return (
    <div className="mt-2 mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 pb-3 pt-2">
      {(title || url) && (
        <div className="mt-2 flex flex-col gap-1">
          {title && (
            <div className="text-sm text-hgray900 font-medium">{title}</div>
          )}
        </div>
      )}
      <div className="text-xs text-hgray600 flex items-center">
        {url && <LinkChip raw={url} size="md" />}
      </div>
      {hasText && (
        <div className="mt-4 text-xs text-hgray700 whitespace-pre-wrap">
          {expanded ? displayText : displayText.slice(0, 360)}
          {displayText.length > 360 && (
            <>
              {!expanded && "…"}
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="ml-2 text-xs text-hgray600 hover:text-hgray900"
              >
                {expanded ? "접기" : "더보기"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export const FileContextCard = React.memo(function FileContextCard({
  block,
}: {
  block: FileContextBlock;
}) {
  const [expanded, setExpanded] = useState(false);
  const excerpt = block.excerpt ?? "";
  const hasExcerpt = excerpt.trim().length > 0;

  return (
    <div className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs text-hgray600 flex items-center gap-1.5">
        <Paperclip className="w-3 h-3" />
        첨부 파일
      </div>
      <div className="mt-2 text-sm text-hgray900 font-medium">{block.name}</div>
      <div className="text-[11px] text-hgray600">
        {[block.mime, formatBytes(block.size)].filter(Boolean).join(" · ")}
      </div>
      {hasExcerpt && (
        <div className="mt-2 text-xs text-hgray700 whitespace-pre-wrap">
          {expanded ? excerpt : excerpt.slice(0, 360)}
          {excerpt.length > 360 && (
            <>
              {!expanded && "…"}
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="ml-2 text-xs text-hgray600 hover:text-hgray900"
              >
                {expanded ? "접기" : "더보기"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export const SettingsCtaCard = React.memo(function SettingsCtaCard({
  block,
}: {
  block: SettingsCtaBlock;
}) {
  const router = useRouter();
  const href = block.href?.trim() || "/my/account";
  const buttonLabel = block.buttonLabel?.trim() || "Settings로 이동";

  return (
    <div className="w-full">
      <div className="inline-flex flex-col rounded-xl bg-white/[0.03] px-4 py-3 text-[13px] backdrop-blur-sm">
        <div
          className="text-white/70 leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: block.text }}
        />

        <button
          type="button"
          onClick={() => router.push(href)}
          className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-md bg-white/[0.04] px-3 py-1.5 text-white/80 hover:bg-white/[0.08] transition"
        >
          {buttonLabel}
          <ArrowRight className="w-3.5 h-3.5 opacity-70" />
        </button>
      </div>
    </div>
  );
});

export const SearchResultCard = React.memo(function SearchResultCard({
  block,
  onRetrySearch,
}: {
  block: SearchResultBlock;
  onRetrySearch?: (runId: string) => Promise<void> | void;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const router = useRouter();
  const queryId =
    typeof router.query.id === "string" ? router.query.id : undefined;
  const runId = block.run_id ?? "";
  const hasCriteriaKey = Object.prototype.hasOwnProperty.call(
    block,
    "criteria"
  );
  const canOpen = !!runId && !!queryId;
  const canRetry = !!runId && !!onRetrySearch && !isRetrying;
  const { data: runData } = useRunDetail(runId || undefined);
  const isPinned = Number((runData as any)?.feedback ?? 0) === 1;

  const openResults = () => {
    if (!canOpen) return;
    router.replace(
      {
        pathname: "/my/c/" + queryId,
        query: { run: runId, page: "0" },
      },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  const retrySearch = async () => {
    if (!canRetry) return;

    setIsRetrying(true);
    try {
      await onRetrySearch?.(runId);
    } catch (error) {
      console.error("retry search failed:", error);
    } finally {
      setIsRetrying(false);
    }
  };

  if (!hasCriteriaKey) {
    const text = block.text?.trim() || "검색 결과";
    const firstText = text.split(" ").slice(0, 2).join(" ");
    return (
      <div className="w-full">
        <div
          onClick={openResults}
          className={`text-sm text-hgray900 flex flex-row items-center justify-between w-full mt-4 relative rounded-3xl border border-white/5 px-4 py-4 overflow-hidden transition-all duration-200 ${
            canOpen ? "cursor-pointer hover:bg-white/5" : "cursor-default"
          }`}
        >
          <div className="font-normal flex flex-row items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-green-500" />
            <span>{firstText}</span>
          </div>
          <div className="flex items-center gap-2">
            {isPinned ? (
              <Pin
                className="h-3.5 w-3.5 text-accenta1"
                fill="currentColor"
                strokeWidth={1.8}
              />
            ) : null}
            <ArrowRight className="w-4 h-4 text-hgray900" />
          </div>
        </div>
      </div>
    );
  }

  const criteria = Array.isArray(block.criteria)
    ? block.criteria.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
      )
    : [];

  const fullCount =
    typeof block.full_count === "number" ? block.full_count : null;
  const partialCount =
    typeof block.partial_count === "number" ? block.partial_count : null;
  const hasCriteria = criteria.length > 0;
  const formatCount = (count: number | null) =>
    count === null ? "-" : `${count}명`;

  if (!fullCount || fullCount <= 0) {
    return (
      <div className="w-full mt-4">
        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] text-hgray900 overflow-hidden">
          <div className="flex text-[13px] items-center gap-2 px-4 py-3">
            <FileSpreadsheet className="w-3 h-3 text-green-500" />
            <span className="font-medium">
              완벽히 일치하는 후보자를 찾지 못했습니다.
            </span>
          </div>

          <div className="text-[13px] px-4 py-1">
            <div>
              일부 조건을 완화하거나, 부분 일치하는 인재를 확인해 보시겠어요?
            </div>
            <div>
              혹은 다시한번 검색하시면, 또 다른 결과가 나올 수도 있어요.
            </div>
          </div>

          <div className="flex flex-col w-full items-center justify-center px-4 pb-4 gap-4">
            <div className="w-full mt-6 border-t border-white/10 pt-4 text-[13px] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-hgray900/70">완벽 일치</span>
                <span className="text-hgray900 font-medium">
                  {formatCount(fullCount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-hgray900/70">부분 일치</span>
                <span className="text-hgray900/70">
                  {formatCount(partialCount)}
                </span>
              </div>
            </div>
            <div className="flex flex-row items-center justify-center gap-2 w-full">
              <button
                type="button"
                onClick={retrySearch}
                disabled={!canRetry}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-all duration-200 ${
                  canRetry
                    ? "bg-accenta1 text-black hover:opacity-80"
                    : "bg-white/10 text-hgray600 cursor-not-allowed"
                }`}
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    검색 중...
                  </>
                ) : (
                  "다시 검색하기"
                )}
              </button>
              <button
                type="button"
                onClick={openResults}
                disabled={!canOpen}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-all duration-200 ${
                  canOpen
                    ? "bg-white/10 text-hgray900"
                    : "bg-white/10 text-hgray600 cursor-not-allowed"
                }`}
              >
                결과 확인
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mt-4">
      <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] text-hgray900 overflow-hidden">
        <div className="flex text-[13px] items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-3 h-3 text-green-500" />
            <span className="font-medium">검색 결과</span>
          </div>
          {isPinned ? (
            <Pin
              className="h-3.5 w-3.5 text-accenta1"
              fill="currentColor"
              strokeWidth={1.8}
            />
          ) : null}
        </div>

        <div className="px-4 py-4">
          <div className="text-xs text-hgray900 font-medium">
            적용된 검색 조건
          </div>
          {hasCriteria ? (
            <ol className="mt-3 space-y-2">
              {criteria.map((item, idx) => (
                <li
                  key={`${item}-${idx}`}
                  className="flex flex-row items-center gap-2 text-[13px] text-hgray900/70"
                >
                  <Check className="w-3.5 h-3.5" /> {item}
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-2 text-sm text-hgray700">
              {block.text?.trim() || "검색 조건 정보가 없습니다."}
            </div>
          )}

          <div className="mt-6 border-t border-white/10 pt-4">
            <div className="text-xs text-hgray900 font-medium">
              검색 결과 요약
            </div>
            <div className="mt-2 space-y-1.5 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-hgray900/70">완벽 일치</span>
                <span className="text-hgray900 font-medium">
                  {formatCount(fullCount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-hgray900/70">부분 일치</span>
                <span className="text-hgray900/70">
                  {formatCount(partialCount)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openResults}
            disabled={!canOpen}
            className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-all duration-200 ${
              canOpen
                ? "bg-accenta1 text-black hover:opacity-80"
                : "bg-white/10 text-hgray600 cursor-not-allowed"
            }`}
          >
            결과 확인
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

function resolveSearchStartStatus(args: {
  block: SearchStartBlock;
  runStatus?: string;
  legacyIsDone?: boolean;
}): SearchStartStatus {
  const { block, runStatus, legacyIsDone } = args;
  const normalizedRunStatus = String(runStatus ?? "")
    .trim()
    .toLowerCase();

  if (normalizedRunStatus === "finished" || normalizedRunStatus === "done") {
    return "done";
  }
  if (normalizedRunStatus === "stopped") {
    return "stopped";
  }
  if (normalizedRunStatus === "error") {
    return "failed";
  }
  if (normalizedRunStatus) {
    return "running";
  }

  if (block.status === "pending") {
    return block.run_id ? "running" : "pending";
  }
  if (
    block.status === "running" ||
    block.status === "done" ||
    block.status === "failed" ||
    block.status === "stopped"
  ) {
    return block.status;
  }
  if (legacyIsDone) {
    return "done";
  }
  if (!block.run_id) {
    return "failed";
  }

  return "running";
}

export const SearchStartCard = React.memo(function SearchStartCard({
  block,
  legacyIsDone = false,
}: {
  block: SearchStartBlock;
  legacyIsDone?: boolean;
}) {
  const router = useRouter();
  const runId = block.run_id?.trim() || "";
  const { data: runData } = useRunDetail(runId || undefined);
  const status = resolveSearchStartStatus({
    block,
    runStatus: (runData as any)?.status,
    legacyIsDone,
  });
  const canOpen = !!runId && status !== "done" && status !== "failed";
  const label =
    status === "done"
      ? "검색 완료"
      : status === "stopped"
        ? "검색이 중단되었습니다."
        : status === "failed"
          ? "검색을 시작하지 못했습니다."
          : block.text;

  return (
    <div
      onClick={() => {
        if (!canOpen) return;
        router.replace(
          {
            pathname: router.pathname,
            query: { ...router.query, run: runId, page: "0" },
          },
          undefined,
          { shallow: true, scroll: false }
        );
      }}
      className={`w-full relative rounded-md overflow-hidden transition-all duration-200 ${
        canOpen ? "cursor-pointer hover:bg-white/5" : "cursor-default"
      }`}
    >
      <div className="text-[13px] text-hgray900 font-normal flex flex-row items-center gap-2">
        {status === "done" ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : status === "failed" || status === "stopped" ? (
          <X className="w-4 h-4 text-hgray600" />
        ) : (
          <Loader2 className="w-4 h-4 animate-spin text-hgray600" />
        )}
        <span>{label}</span>
      </div>
      {canOpen && (
        <div className="text-xs text-hgray600 mt-1">
          클릭하면 검색 화면으로 이동합니다.
        </div>
      )}
    </div>
  );
});
