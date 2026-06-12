// components/chat/ChatBoxes.tsx
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type {
  AttachmentContextBlock,
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
  Link2,
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
  SEARCH_SOURCE_DESCRIPTIONS,
} from "@/lib/searchSource";
import { useRunDetail } from "@/hooks/useRunDetail";
import { Tooltips } from "../ui/tooltip";
import { useMessages } from "@/i18n/useMessage";
import { BareButton } from "@/components/ui/button";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

const DEFAULT_CRITERIA_CARD_SOURCES: EnabledSearchSource[] = ["linkedin"];

export type ChatTheme = "dark" | "cream";

type CriteriaItemProps = {
  criteria: string;
  onRemove: () => void;
  onConfirm: (next: string) => void;

  startEditing?: boolean;
  placeholder?: string;
  autoRemoveIfEmpty?: boolean;
  onCancel?: () => void;
  theme?: ChatTheme;
};

export const CriteriaItem = React.memo(function CriteriaItem({
  criteria,
  onRemove,
  onConfirm,
  startEditing,
  placeholder = "Add criteria...",
  autoRemoveIfEmpty,
  onCancel,
  theme = "cream",
}: CriteriaItemProps) {
  const isDark = theme === "dark";
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
      className={`relative flex items-center gap-2 rounded-2xl text-[13px] font-light px-3 pt-2 group cursor-pointer transition-all duration-200 ${isDark ? "hover:bg-neutral-00/5" : "hover:bg-bg-floating"}
          ${
            isEditing
              ? isDark
                ? "border border-neutral-00/5 bg-neutral-00/5 pb-4"
                : "border border-neutral-1000-a05 bg-bg-floating pb-4"
              : "border border-transparent pb-2"
          }
          `}
    >
      {!isEditing ? (
        <>
          <ClickablePanel
            onActivate={() => {
              setIsEditing(true);
            }}
            className="flex w-full flex-row items-center justify-between gap-2"
          >
            <span
              className={isDark ? "text-neutral-00/90" : "text-neutral-primary"}
            >
              {criteria}
            </span>
            <Pencil
              strokeWidth={1.6}
              className={
                isDark
                  ? "w-2.5 h-2.5 text-neutral-00/50"
                  : "w-2.5 h-2.5 text-neutral-soft"
              }
            />
          </ClickablePanel>
          <BareButton
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className={`absolute top-[-4px] right-0 text-xs opacity-0 group-hover:opacity-100 transition-all duration-200 ${isDark ? "text-neutral-00/70 hover:text-neutral-00/90" : "text-neutral-muted hover:text-neutral-primary"}`}
            aria-label="Remove"
          >
            ✕
          </BareButton>
        </>
      ) : (
        <>
          <UiInput
            unstyled
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
            className={`w-full bg-transparent outline-none pr-14 ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
          />

          <BareButton
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
                      ? isDark
                        ? "text-accent-300"
                        : "text-primary"
                      : isDark
                        ? "text-neutral-00/60"
                        : "text-neutral-soft"
                    : isChanged
                      ? isDark
                        ? "text-accent-300"
                        : "text-primary"
                      : isDark
                        ? "text-neutral-00/60"
                        : "text-neutral-soft"
                }
                `}
          >
            Confirm
          </BareButton>
        </>
      )}
    </div>
  );
});

type QueryTextItemProps = {
  text: string;
  onConfirm: (next: string) => void;
  placeholder?: string;
  theme?: ChatTheme;
};

const QueryTextItem = React.memo(function QueryTextItem({
  text,
  onConfirm,
  placeholder = "검색 query를 입력하세요.",
  theme = "cream",
}: QueryTextItemProps) {
  const isDark = theme === "dark";
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
      className={`relative mt-2 rounded-2xl px-3 pt-2 transition-all duration-200 cursor-pointer ${isDark ? "hover:bg-neutral-00/5" : "hover:bg-bg-floating"}
        ${isEditing ? (isDark ? "border border-neutral-00/5 bg-neutral-00/5 pb-6" : "border border-neutral-1000-a05 bg-bg-floating pb-6") : "border border-transparent pb-2"}`}
    >
      {!isEditing ? (
        <ClickablePanel
          onActivate={() => {
            setIsEditing(true);
          }}
          className={`text-[13px] whitespace-pre-wrap leading-relaxed ${
            isDark
              ? text
                ? "text-neutral-00/70"
                : "text-neutral-00/60"
              : text
                ? "text-neutral-primary"
                : "text-neutral-soft"
          }`}
        >
          {text || placeholder}
        </ClickablePanel>
      ) : (
        <>
          <UiTextarea
            unstyled
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
            className={`w-full resize-none bg-transparent outline-none text-xs leading-relaxed pr-14 ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
          />

          <BareButton
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              commit();
            }}
            className={`absolute bottom-2 right-2 text-xs transition-all duration-200 ${
              isChanged
                ? isDark
                  ? "text-accent-300"
                  : "text-primary"
                : isDark
                  ? "text-neutral-00/60"
                  : "text-neutral-soft"
            }`}
          >
            Confirm
          </BareButton>
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
          className="flex items-center justify-center p-1 rounded-full bg-bg-default"
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
  theme = "cream",
}: {
  block: CriteriaCardBlock;
  onConfirm?: (b: CriteriaCardBlock) => void;
  onChange?: (b: CriteriaCardBlock) => void;
  disabled?: boolean;
  theme?: ChatTheme;
}) {
  const isDark = theme === "dark";
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
        <div
          className={`text-xs font-extralight flex flex-row items-center gap-1.5 ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
        >
          <span>
            <Bolt
              className={`w-2.5 h-2.5 ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
            />
          </span>
          Search
        </div>
        <div
          className={`mt-2 rounded-3xl px-4 py-4 transition-all duration-200 ${isDark ? "border border-neutral-00/10 bg-neutral-00/5" : "border border-neutral-1000-a05 bg-bg-default"}
        ${disabled ? "pointer-events-none cursor-default" : ""}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div
              className={`text-sm font-semibold flex items-center gap-2 ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
            >
              검색 방법
            </div>
          </div>

          <QueryTextItem
            text={draft.thinking ?? ""}
            onConfirm={updateQueryText}
            theme={theme}
          />

          <div
            className={`mt-3 text-xs ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
          >
            Sources
          </div>

          <div className="flex flex-row gap-1 items-center justify-between">
            <div
              className={`text-sm font-light ${isDark ? "text-neutral-00" : "text-neutral-primary"}`}
            >
              검색에 사용할 출처
            </div>

            <DropdownMenu
              open={sourcesMenuOpen}
              onOpenChange={setSourcesMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <BareButton
                  type="button"
                  className={`inline-flex items-center gap-2 rounded-full pr-3 pl-2.5 py-1.5 text-sm transition-all duration-200 ${isDark ? "bg-neutral-00/5 border border-neutral-00/10 text-neutral-00/90 hover:bg-neutral-00/10" : "bg-bg-floating border border-neutral-1000-a05 text-neutral-primary hover:bg-bg-weak"}`}
                >
                  <SourceIcons sources={selectedSources} />
                  <ChevronDown className="h-3.5 w-3.5" />
                </BareButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={`w-[220px] rounded-2xl p-2 backdrop-blur-sm ${isDark ? "border-neutral-00/10 bg-black/70" : "border-neutral-1000-a05 bg-bg-default"}`}
              >
                <div
                  className={`px-1 pb-2 text-[11px] ${isDark ? "text-neutral-00/70" : "text-neutral-muted"}`}
                >
                  검색에 사용할 출처를 선택하세요.
                </div>
                <div className="flex flex-col gap-1">
                  {ENABLED_SEARCH_SOURCE_VALUES.map((source) => {
                    const checked = selectedSources.includes(source);
                    return (
                      <Tooltips
                        key={source}
                        text={SEARCH_SOURCE_DESCRIPTIONS[source]}
                      >
                        <BareButton
                          key={source}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleSource(source);
                          }}
                          className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all duration-200 ${
                            isDark
                              ? checked
                                ? "bg-neutral-00/10"
                                : "hover:bg-neutral-00/5"
                              : checked
                                ? "bg-bg-floating"
                                : "hover:bg-bg-floating"
                          }`}
                        >
                          <div
                            className={`flex items-center gap-2 ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
                          >
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
                              className={`absolute inset-0 h-3.5 w-3.5 transition-all duration-200 ${isDark ? "text-accent-300" : "text-primary"} ${
                                checked
                                  ? "opacity-100 translate-y-0 group-hover:opacity-0 group-hover:-translate-y-1.5"
                                  : "pointer-events-none opacity-0 translate-y-1.5"
                              }`}
                            />
                            <ChevronDown
                              className={`absolute inset-0 h-3.5 w-3.5 transition-all duration-200 ${isDark ? "text-neutral-00/70" : "text-neutral-muted"} ${
                                checked
                                  ? "opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0"
                                  : "pointer-events-none opacity-0 translate-y-1.5"
                              }`}
                            />
                            <ChevronUp
                              className={`absolute inset-0 h-3.5 w-3.5 transition-all duration-200 ${isDark ? "text-neutral-00/70" : "text-neutral-muted"} ${
                                checked
                                  ? "pointer-events-none opacity-0 -translate-y-1.5"
                                  : "opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0"
                              }`}
                            />
                          </div>
                        </BareButton>
                      </Tooltips>
                    );
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            className={`mt-3 text-xs ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
          >
            Criteria
          </div>

          {Array.isArray(draft.criteria) && draft.criteria.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {draft.criteria.map((c, idx) => (
                <CriteriaItem
                  key={`${idx}`}
                  criteria={c}
                  onRemove={() => removeCriteriaAt(idx)}
                  onConfirm={(next) => updateCriteriaAt(idx, next)}
                  theme={theme}
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
                theme={theme}
              />
            </div>
          )}

          <BareButton
            type="button"
            onClick={() => {
              if (!pendingAdd) setPendingAdd(true);
            }}
            className={`rounded-2xl font-light pl-2 pr-3 py-2 text-sm flex items-center gap-1 mt-4 transition-all duration-200 ${isDark ? "hover:bg-neutral-00/5 text-neutral-00/90" : "hover:bg-bg-floating text-neutral-primary"}`}
          >
            <Plus size={16} />
            Add Criteria
          </BareButton>

          <BareButton
            type="button"
            className={`mt-4 w-full rounded-full py-2.5 text-sm hover:opacity-90 disabled:opacity-50 ${
              isDark
                ? "bg-accent-300 text-neutral-primary"
                : "bg-black text-neutral-00"
            } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
            disabled={disabled}
            // disabled={!draft.ready || disabled}
            onClick={() => onConfirm?.(draft)}
          >
            Confirm & Search
          </BareButton>
        </div>
      </div>
    </div>
  );
});

export const CriteriaLoading = React.memo(function CriteriaLoading({
  theme = "cream",
}: {
  theme?: ChatTheme;
}) {
  const isDark = theme === "dark";
  return (
    <div
      className={`relative mt-3 rounded-3xl px-4 py-4 overflow-hidden ${isDark ? "border border-neutral-00/10 bg-neutral-00/5" : "border border-neutral-1000-a05 bg-bg-default"}`}
    >
      {/* shimmer layer */}
      <div className="pointer-events-none absolute inset-0 shimmer-bg" />

      <div
        className={`relative text-sm font-normal ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
      >
        후보자를 찾을 방법을 설계하고 있습니다...
      </div>
    </div>
  );
});

export const ToolStatusCard = React.memo(function ToolStatusCard({
  name,
  state = "running",
  message,
  theme = "cream",
}: ToolStatusBlock & { theme?: ChatTheme }) {
  const isDark = theme === "dark";
  const label =
    name === "web_search"
      ? "웹 검색"
      : name === "website_scraping"
        ? "필요한 정보를 읽고 있습니다"
        : "도구 실행";

  if (state === "done") {
    return (
      <div
        className={`w-full text-xs flex flex-row items-center gap-1 ${isDark ? "text-neutral-00/70" : "text-neutral-muted"}`}
      >
        <Check size={12} /> {label} 완료
      </div>
    );
  }

  // if (state === "error") {
  //   return (
  //     <div className="w-full text-xs text-critical flex flex-row items-center gap-1">
  //       <AlertTriangle size={12} /> 실패{message ? `: ${message}` : ""}
  //     </div>
  //   );
  // }

  return (
    <div
      className={`w-full text-xs flex items-center gap-1 mt-2 ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      {label}...
    </div>
  );
});

export const ToolStatusToggle = React.memo(function ToolStatusToggle({
  items,
  theme = "cream",
}: {
  items: ToolStatusBlock[];
  theme?: ChatTheme;
}) {
  const isDark = theme === "dark";
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full mt-1 mb-2">
      <BareButton
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`text-xs flex flex-row items-center gap-1 group ${isDark ? "text-neutral-00/70" : "text-neutral-muted"}`}
      >
        <Check size={12} />
        검색 완료
        <span
          className={`transition-all duration-200 ${isDark ? "text-neutral-00/60 group-hover:text-neutral-00/90" : "text-neutral-muted group-hover:text-neutral-primary"}`}
        >
          {open ? "접기" : "보기"}
        </span>
      </BareButton>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {items.map((s, idx) => (
            <ToolStatusCard
              key={`${s.id ?? s.name ?? "tool"}-${idx}`}
              {...s}
              theme={theme}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export function formatBytes(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export const DocumentCard = React.memo(function DocumentCard({
  title,
  url,
  excerpt,
  label,
  theme = "cream",
}: {
  title?: string;
  url?: string;
  excerpt?: string;
  label: string;
  theme?: ChatTheme;
}) {
  const isDark = theme === "dark";
  const [expanded, setExpanded] = useState(false);
  const displayText = excerpt ?? "";
  const hasText = displayText.trim().length > 0;

  return (
    <div
      className={`mt-2 mb-4 rounded-2xl px-4 pb-3 pt-2 ${isDark ? "border border-neutral-00/10 bg-neutral-00/5" : "border border-neutral-1000-a05 bg-bg-default"}`}
    >
      {(title || url) && (
        <div className="mt-2 flex flex-col gap-1">
          {title && (
            <div
              className={`text-sm font-medium ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
            >
              {title}
            </div>
          )}
        </div>
      )}
      <div
        className={`text-xs flex items-center ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
      >
        {url && <LinkChip raw={url} size="md" theme={theme} />}
      </div>
      {hasText && (
        <div
          className={`mt-4 text-xs whitespace-pre-wrap ${isDark ? "text-neutral-00/70" : "text-neutral-muted"}`}
        >
          {expanded ? displayText : displayText.slice(0, 360)}
          {displayText.length > 360 && (
            <>
              {!expanded && "…"}
              <BareButton
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className={`ml-2 text-xs ${isDark ? "text-neutral-00/60 hover:text-neutral-00/90" : "text-neutral-muted hover:text-neutral-primary"}`}
              >
                {expanded ? "접기" : "더보기"}
              </BareButton>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export const AttachmentContextCard = React.memo(function AttachmentContextCard({
  block,
  theme = "cream",
}: {
  block: AttachmentContextBlock;
  theme?: ChatTheme;
}) {
  const isDark = theme === "dark";
  const [expanded, setExpanded] = useState(false);
  const { m } = useMessages();
  const excerpt = block.excerpt ?? "";
  const hasExcerpt = excerpt.trim().length > 0;
  const isLink = block.kind === "link";

  return (
    <div
      className={`mt-2 w-full rounded-2xl px-4 py-3 ${isDark ? "border border-neutral-00/10 bg-neutral-00/5" : "border border-neutral-1000-a05 bg-bg-default"}`}
    >
      <div
        className={`flex items-center gap-1.5 text-xs ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
      >
        {isLink ? (
          <LinkChip
            raw={block.url ?? ""}
            size="md"
            theme={theme}
            className="mt-0"
          />
        ) : (
          <>
            <Paperclip className="h-3 w-3" />
            <span>{m.chat.attachedFileLabel ?? "첨부 파일"}</span>
          </>
        )}
      </div>
      <div
        className={`mt-2 text-sm font-medium ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
      >
        {block.name}
      </div>
      <div
        className={`mt-1 text-[11px] ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
      >
        {[block.mime, formatBytes(block.size)].filter(Boolean).join(" · ")}
      </div>
      {hasExcerpt && (
        <div
          className={`mt-2 text-xs whitespace-pre-wrap ${isDark ? "text-neutral-00/70" : "text-neutral-muted"}`}
        >
          {expanded ? excerpt : excerpt.slice(0, 360)}
          {excerpt.length > 360 && (
            <>
              {!expanded && "…"}
              <BareButton
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className={`ml-2 text-xs ${isDark ? "text-neutral-00/60 hover:text-neutral-00/90" : "text-neutral-muted hover:text-neutral-primary"}`}
              >
                {expanded ? "접기" : "더보기"}
              </BareButton>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export const FileContextCard = React.memo(function FileContextCard({
  block,
  theme = "cream",
}: {
  block: FileContextBlock;
  theme?: ChatTheme;
}) {
  return (
    <AttachmentContextCard
      block={{
        type: "attachment_context",
        kind: "file",
        name: block.name,
        text: block.text,
        size: block.size,
        mime: block.mime,
        excerpt: block.excerpt,
        truncated: block.truncated,
      }}
      theme={theme}
    />
  );
});

export const SettingsCtaCard = React.memo(function SettingsCtaCard({
  block,
  theme = "cream",
}: {
  block: SettingsCtaBlock;
  theme?: ChatTheme;
}) {
  const isDark = theme === "dark";
  const router = useRouter();
  const href = block.href?.trim() || "/my/account";
  const buttonLabel = block.buttonLabel?.trim() || "Settings로 이동";

  return (
    <div className="w-full">
      <div
        className={`inline-flex flex-col rounded-xl px-4 py-3 text-[13px] backdrop-blur-sm ${isDark ? "bg-neutral-00/5" : "bg-bg-default border border-neutral-1000-a05"}`}
      >
        <div
          className={`leading-relaxed whitespace-pre-wrap ${isDark ? "text-neutral-00/70" : "text-neutral-primary"}`}
          dangerouslySetInnerHTML={{ __html: block.text }}
        />

        <BareButton
          type="button"
          onClick={() => router.push(href)}
          className={`mt-4 inline-flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 transition ${isDark ? "bg-neutral-00/5 text-neutral-00/80 hover:bg-neutral-00/10" : "bg-bg-floating text-neutral-primary hover:bg-bg-weak"}`}
        >
          {buttonLabel}
          <ArrowRight className="w-3.5 h-3.5 opacity-70" />
        </BareButton>
      </div>
    </div>
  );
});

export const SearchResultCard = React.memo(function SearchResultCard({
  block,
  onRetrySearch,
  theme = "cream",
}: {
  block: SearchResultBlock;
  onRetrySearch?: (runId: string) => Promise<void> | void;
  theme?: ChatTheme;
}) {
  const isDark = theme === "dark";
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
          className={`text-sm flex flex-row items-center justify-between w-full mt-4 relative rounded-3xl px-4 py-4 overflow-hidden transition-all duration-200 ${isDark ? "text-neutral-00/90 border border-neutral-00/5" : "text-neutral-primary border border-neutral-1000-a05"} ${
            canOpen
              ? isDark
                ? "cursor-pointer hover:bg-neutral-00/5"
                : "cursor-pointer hover:bg-bg-floating"
              : "cursor-default"
          }`}
        >
          <div className="font-normal flex flex-row items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-positive" />
            <span>{firstText}</span>
          </div>
          <div className="flex items-center gap-2">
            {isPinned ? (
              <Pin
                className={`h-3.5 w-3.5 ${isDark ? "text-accent-300" : "text-primary"}`}
                fill="currentColor"
                strokeWidth={1.8}
              />
            ) : null}
            <ArrowRight
              className={`w-4 h-4 ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
            />
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
        <div
          className={`w-full rounded-2xl overflow-hidden ${isDark ? "border border-neutral-00/10 bg-neutral-00/5 text-neutral-00/90" : "border border-neutral-1000-a05 bg-bg-default text-neutral-primary"}`}
        >
          <div className="flex text-[13px] items-center gap-2 px-4 py-3">
            <FileSpreadsheet className="w-3 h-3 text-positive" />
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
            <div
              className={`w-full mt-6 pt-4 text-[13px] space-y-1.5 ${isDark ? "border-t border-neutral-00/10" : "border-t border-neutral-1000-a05"}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    isDark ? "text-neutral-00/70" : "text-neutral-primary"
                  }
                >
                  완벽 일치
                </span>
                <span
                  className={`font-medium ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
                >
                  {formatCount(fullCount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={
                    isDark ? "text-neutral-00/70" : "text-neutral-primary"
                  }
                >
                  부분 일치
                </span>
                <span
                  className={
                    isDark ? "text-neutral-00/70" : "text-neutral-primary"
                  }
                >
                  {formatCount(partialCount)}
                </span>
              </div>
            </div>
            <div className="flex flex-row items-center justify-center gap-2 w-full">
              <BareButton
                type="button"
                onClick={retrySearch}
                disabled={!canRetry}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-all duration-200 ${
                  canRetry
                    ? isDark
                      ? "bg-accent-300 text-neutral-primary hover:opacity-80"
                      : "bg-black text-neutral-00 hover:opacity-80"
                    : isDark
                      ? "bg-neutral-00/10 text-neutral-00/60 cursor-not-allowed"
                      : "bg-bg-weak text-neutral-soft cursor-not-allowed"
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
              </BareButton>
              <BareButton
                type="button"
                onClick={openResults}
                disabled={!canOpen}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-all duration-200 ${
                  canOpen
                    ? isDark
                      ? "bg-neutral-00/10 text-neutral-00/90"
                      : "bg-bg-floating text-neutral-primary"
                    : isDark
                      ? "bg-neutral-00/10 text-neutral-00/60 cursor-not-allowed"
                      : "bg-bg-weak text-neutral-soft cursor-not-allowed"
                }`}
              >
                결과 확인
                <ArrowRight className="w-4 h-4" />
              </BareButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mt-4">
      <div
        className={`w-full rounded-2xl overflow-hidden ${isDark ? "border border-neutral-00/10 bg-neutral-00/5 text-neutral-00/90" : "border border-neutral-1000-a05 bg-bg-default text-neutral-primary"}`}
      >
        <div
          className={`flex text-[13px] items-center justify-between gap-2 px-4 py-3 ${isDark ? "border-b border-neutral-00/10" : "border-b border-neutral-1000-a05"}`}
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-3 h-3 text-positive" />
            <span className="font-medium">검색 결과</span>
          </div>
          {isPinned ? (
            <Pin
              className={`h-3.5 w-3.5 ${isDark ? "text-accent-300" : "text-primary"}`}
              fill="currentColor"
              strokeWidth={1.8}
            />
          ) : null}
        </div>

        <div className="px-4 py-4">
          <div
            className={`text-xs font-medium ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
          >
            적용된 검색 조건
          </div>
          {hasCriteria ? (
            <ol className="mt-3 space-y-2">
              {criteria.map((item, idx) => (
                <li
                  key={`${item}-${idx}`}
                  className={`flex flex-row items-center gap-2 text-[13px] ${isDark ? "text-neutral-00/70" : "text-neutral-primary"}`}
                >
                  <Check className="w-3.5 h-3.5" /> {item}
                </li>
              ))}
            </ol>
          ) : (
            <div
              className={`mt-2 text-sm ${isDark ? "text-neutral-00/70" : "text-neutral-muted"}`}
            >
              {block.text?.trim() || "검색 조건 정보가 없습니다."}
            </div>
          )}

          <div
            className={`mt-6 pt-4 ${isDark ? "border-t border-neutral-00/10" : "border-t border-neutral-1000-a05"}`}
          >
            <div
              className={`text-xs font-medium ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
            >
              검색 결과 요약
            </div>
            <div className="mt-2 space-y-1.5 text-[13px]">
              <div className="flex items-center justify-between">
                <span
                  className={
                    isDark ? "text-neutral-00/70" : "text-neutral-primary"
                  }
                >
                  완벽 일치
                </span>
                <span
                  className={`font-medium ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
                >
                  {formatCount(fullCount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={
                    isDark ? "text-neutral-00/70" : "text-neutral-primary"
                  }
                >
                  부분 일치
                </span>
                <span
                  className={
                    isDark ? "text-neutral-00/70" : "text-neutral-primary"
                  }
                >
                  {formatCount(partialCount)}
                </span>
              </div>
            </div>
          </div>

          <BareButton
            type="button"
            onClick={openResults}
            disabled={!canOpen}
            className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-all duration-200 ${
              canOpen
                ? isDark
                  ? "bg-accent-300 text-neutral-primary hover:opacity-80"
                  : "bg-black text-neutral-00 hover:opacity-80"
                : isDark
                  ? "bg-neutral-00/10 text-neutral-00/60 cursor-not-allowed"
                  : "bg-bg-weak text-neutral-soft cursor-not-allowed"
            }`}
          >
            결과 확인
            <ArrowRight className="w-4 h-4" />
          </BareButton>
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
  theme = "cream",
}: {
  block: SearchStartBlock;
  legacyIsDone?: boolean;
  theme?: ChatTheme;
}) {
  const isDark = theme === "dark";
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
        canOpen
          ? isDark
            ? "cursor-pointer hover:bg-neutral-00/5"
            : "cursor-pointer hover:bg-bg-floating"
          : "cursor-default"
      }`}
    >
      <div
        className={`text-[13px] font-normal flex flex-row items-center gap-2 ${isDark ? "text-neutral-00/90" : "text-neutral-primary"}`}
      >
        {status === "done" ? (
          <Check className="w-4 h-4 text-positive" />
        ) : status === "failed" || status === "stopped" ? (
          <X
            className={`w-4 h-4 ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
          />
        ) : (
          <Loader2
            className={`w-4 h-4 animate-spin ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
          />
        )}
        <span>{label}</span>
      </div>
      {canOpen && (
        <div
          className={`text-xs mt-1 ${isDark ? "text-neutral-00/60" : "text-neutral-muted"}`}
        >
          클릭하면 검색 화면으로 이동합니다.
        </div>
      )}
    </div>
  );
});
