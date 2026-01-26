// components/chat/ChatMessageList.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChatMessage, CriteriaCardBlock } from "@/types/chat";
import { Bolt, Check, FileSpreadsheet, Loader2, Plus } from "lucide-react";
import { logger } from "@/utils/logger";
import { useRouter } from "next/router";
import Image from "next/image";

type CriteriaItemProps = {
  criteria: string;
  onRemove: () => void;
  onConfirm: (next: string) => void;

  startEditing?: boolean;
  placeholder?: string;
  autoRemoveIfEmpty?: boolean;
  onCancel?: () => void;
};

export const CriteriaItem = ({
  criteria,
  onRemove,
  onConfirm,
  startEditing,
  placeholder = "Add criteria...",
  autoRemoveIfEmpty,
  onCancel,
}: CriteriaItemProps) => {
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
        ${isEditing
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
};
function CriteriaCard({
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
    <div className="mt-2">
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
        className={`mt-2 rounded-3xl border border-white/10 bg-white/5 px-2 py-4 transition-all duration-200
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

        {/* ✅ criteria 목록: 수정/삭제 */}
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

        {/* ✅ pending add row (UI only, not committed yet) */}
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

        {/* ✅ criteria 추가 버튼 */}
        <button
          type="button"
          onClick={() => {
            // ✅ 이미 추가 중이면 다시 누르지 않게
            if (!pendingAdd) setPendingAdd(true);
          }}
          className="rounded-2xl font-light hover:bg-white/5 pl-2 pr-3 py-2 text-sm text-hgray900 flex items-center gap-1 mt-4 transition-all duration-200"
        >
          <Plus size={16} />
          Add Criteria
        </button>

        <button
          type="button"
          className={`mt-4 w-full rounded-full bg-accenta1 text-black py-2.5 text-sm hover:opacity-90 disabled:opacity-50 ${disabled ? "cursor-not-allowed" : "cursor-pointer"
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
}

const CriteriaLoading = () => {
  return (
    <div className="relative mt-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-4 overflow-hidden">
      {/* shimmer layer */}
      <div className="pointer-events-none absolute inset-0 shimmer-bg" />

      <div className="relative text-sm text-hgray900 font-normal">
        후보자를 찾을 방법을 설계하고 있습니다...
      </div>
    </div>
  );
};

const SearchResultCard = ({ text, runId }: { text: string; runId: string }) => {
  const router = useRouter();
  const firstText = text.split(" ").slice(0, 2).join(" ");
  const restText = text.split(" ").slice(2).join(" ");

  return (
    <div>
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
        className="mt-4 relative rounded-3xl border border-white/5 px-4 py-4 overflow-hidden cursor-pointer hover:bg-white/5 transition-all duration-200"
      >
        <div className="text-sm text-hgray900 font-normal flex flex-row items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-green-500" />
          <span className="">{firstText}</span>
          {/* <span className="text-hgray600 text-xs">{restText}</span> */}
        </div>
      </div>
      <div className="text-xs text-green-500 flex flex-row items-center gap-1 px-0 mt-2">
        <Check size={12} /> 검색 완료!
      </div>
    </div>
  );
};

type Props = {
  messages: ChatMessage[];
  isStreaming: boolean;
  error?: string | null;

  onConfirmCriteriaCard?: (messageId: number) => void;
  onChangeCriteriaCard?: (args: {
    messageId: number;
    modifiedBlock: CriteriaCardBlock;
  }) => void;
};

export default function ChatMessageList({
  messages,
  isStreaming,
  error,
  onConfirmCriteriaCard,
  onChangeCriteriaCard,
}: Props) {
  const lastBlockMessageIdx = useMemo(() => {
    return messages.findIndex((m) =>
      m.segments?.some((s) => s.type === "block")
    );
  }, [messages]);

  return (
    <div className="flex-1 pr-2 space-y-8">
      {messages.length === 0 && (
        <div className="text-sm text-hgray600">
          검색 요청을 입력하면 대화가 시작됩니다.
        </div>
      )}

      {messages.map((m, idx) => {
        const isUser = m.role === "user";
        const bubbleCls = isUser
          ? "ml-auto border border-white/10 bg-hgray100/70 text-hgray900 py-3 px-4"
          : "bg-white/0 text-hgray800 mt-1";

        return (
          <div className="flex flex-col gap-1" key={`${m.role}-${idx}`}>
            <div
              className={`text-xs text-ngray600 ${isUser ? "text-right" : "text-left"
                }`}
            >
              {isUser ? (
                "me"
              ) : (
                <div className="flex flex-row items-center justify-start gap-1.5">
                  <span className="text-xs text-ngray600">
                    {/* <Bolt className="w-3 h-3" /> */}
                    <Image
                      src="/svgs/logo.svg"
                      alt="Harper"
                      width={9}
                      height={9}
                      className="text-hgray600"
                    />
                  </span>
                  <span>Harper</span>
                </div>
              )}
            </div>
            <div
              className={`max-w-[98%] rounded-3xl text-sm leading-relaxed ${bubbleCls}`}
            >
              <div className="whitespace-pre-wrap break-words">
                {m.segments?.map((s, si) => {
                  if (s.type === "text") {
                    return (
                      <div
                        key={`text-${idx}-${si}`}
                        className="whitespace-pre-wrap break-words"
                      // dangerouslySetInnerHTML={{ __html: s.content }}
                      >
                        {s.content.replace(/<br\s*\/?>/g, "\n")}
                        {!isUser &&
                          isStreaming &&
                          idx === messages.length - 1 &&
                          si == (m.segments?.length ?? 0) - 1 && (
                            <span className="inline-block w-2 ml-1 align-baseline animate-pulse">
                              ▍
                            </span>
                          )}
                      </div>
                    );
                  }
                  if (s.type === "block") {
                    if (s.content.type === "criteria_card") {
                      return (
                        <CriteriaCard
                          key={`block-${idx}-${si}`}
                          block={s.content as CriteriaCardBlock}
                          onChange={(modifiedBlock) => {
                            onChangeCriteriaCard?.({
                              messageId: m.id as number,
                              modifiedBlock,
                            });
                            logger.log("onChangeCriteriaCard", modifiedBlock);
                          }}
                          onConfirm={() =>
                            onConfirmCriteriaCard?.(Number(m.id))
                          }
                          disabled={false}
                        // disabled={idx < lastBlockMessageIdx}
                        />
                      );
                    }
                    if (s.content.type === "criteria_loading") {
                      return <CriteriaLoading key={`block-${idx}-${si}`} />;
                    }
                    if (s.content.type === "search_result") {
                      return (
                        <SearchResultCard
                          text={s.content.text}
                          runId={s.content.run_id}
                          key={`block-${idx}-${si}`}
                        />
                      );
                    }
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        );
      })}

      {isStreaming && (
        <div className="text-xs text-hgray600 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          응답 작성 중...
        </div>
      )}

      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}
