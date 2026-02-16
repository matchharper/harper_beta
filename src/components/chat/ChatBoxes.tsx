// components/chat/ChatMessageList.tsx
import React, { useEffect, useRef, useState } from "react";
import type {
  CriteriaCardBlock,
  ToolStatusBlock,
  FileContextBlock,
  SettingsCtaBlock,
} from "@/types/chat";
import {
  Bolt,
  Check,
  FileSpreadsheet,
  Loader2,
  Plus,
  Paperclip,
  Settings,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/router";
import { LinkChip } from "../information/LinkChips";

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
        <>
          <span className="text-hgray900">{criteria}</span>

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
        </>
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
  const [draft, setDraft] = React.useState<CriteriaCardBlock>(block);

  useEffect(() => {
    setDraft(block);
  }, [block]);

  const updateCriteriaAt = (idx: number, value: string) => {
    const next = [...(draft.criteria ?? [])];
    next[idx] = value;
    onChange?.({ ...draft, criteria: next });
    setDraft({ ...draft, criteria: next });
  };

  const removeCriteriaAt = (idx: number) => {
    const next = [...(draft.criteria ?? [])].filter((_, i) => i !== idx);
    onChange?.({ ...draft, criteria: next });
    setDraft({ ...draft, criteria: next });
  };

  const commitAdd = (value: string) => {
    const v = value.trim();
    if (!v) {
      setPendingAdd(false);
      return;
    }
    const next = [...(draft.criteria ?? []), v];
    onChange?.({ ...draft, criteria: next });
    setDraft({ ...draft, criteria: next });
    setPendingAdd(false);
  };

  const cancelAdd = () => {
    setPendingAdd(false);
  };

  return (
    <div className="mt-2 w-full max-w-[440px]">
      <div className="text-xs text-hgray600 font-extralight flex flex-row items-center gap-1.5">
        <span>
          {/* <img
              src="/svgs/logo.svg"
              alt="Harper"
              className="w-[9px] h-[9px] text-hgray600"
            /> */}
          <Bolt className="w-2.5 h-2.5 text-hgray600" />
        </span>
        Search
      </div>
      <div
        className={`mt-2 rounded-3xl border border-white/10 bg-white/5 px-4 py-4 transition-all duration-200
        ${disabled ? "pointer-events-none cursor-default" : ""}`}
      >
        <div className="text-sm text-hgray900 font-semibold flex items-center gap-2">
          검색 방법
        </div>

        {draft.thinking && (
          <div className="mt-2 text-xs text-hgray700 whitespace-pre-wrap leading-relaxed">
            {draft.thinking}
          </div>
        )}

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
  text,
  runId,
}: {
  text: string;
  runId: string;
}) {
  const router = useRouter();
  const firstText = text.split(" ").slice(0, 2).join(" ");

  return (
    <div className="w-full">
      <div
        onClick={() => {
          router.replace(
            {
              pathname: "/my/c/" + router.query.id,
              query: { run: runId, page: "0" },
            },
            undefined,
            { shallow: true, scroll: false }
          );
        }}
        className="w-full mt-4 relative rounded-3xl border border-white/5 px-4 py-4 overflow-hidden cursor-pointer hover:bg-white/5 transition-all duration-200"
      >
        <div className="text-sm text-hgray900 font-normal flex flex-row items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-green-500" />
          <span className="">{firstText}</span>
          {/* <span className="text-hgray600 text-xs">{restText}</span> */}
        </div>
      </div>
      {/* <div className="text-xs text-green-500 flex flex-row items-center gap-1 px-0 mt-2">
          <Check size={12} /> 검색 완료!
        </div> */}
    </div>
  );
});

export const SearchStartCard = React.memo(function SearchStartCard({
  text,
  runId,
  isDone = false,
}: {
  text: string;
  runId?: string;
  isDone?: boolean;
}) {
  const router = useRouter();
  const canOpen = !!runId && !isDone;

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
        {isDone ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Loader2 className="w-4 h-4 animate-spin text-hgray600" />
        )}
        <span>{isDone ? "검색 완료" : text}</span>
      </div>
      {canOpen && (
        <div className="text-xs text-hgray600 mt-1">
          클릭하면 검색 진행 화면으로 이동합니다.
        </div>
      )}
    </div>
  );
});
