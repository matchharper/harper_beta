import React, { useCallback, useEffect, useRef, useState } from 'react'
import ChatMessageList from './ChatMessageList';
import { BOTTOM_THRESHOLD_PX } from './ChatPanel';
import { ArrowDown } from 'lucide-react';
import { extractUiSegments } from '@/hooks/chat/useChatSession';

const SharedChatPanel = ({ title, messages }: { title: string, messages: any[] }) => {
    const [showJumpToBottom, setShowJumpToBottom] = useState(false);
    const [stickToBottom, setStickToBottom] = useState(true);
    const scrollRef = useRef<HTMLDivElement | null>(null);


    const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior });
    }, []);

    const recomputeStickiness = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;

        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = distanceToBottom <= BOTTOM_THRESHOLD_PX;

        setStickToBottom(atBottom);
        setShowJumpToBottom(!atBottom);
    }, []);

    // ✅ attach scroll listener
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const onScroll = () => recomputeStickiness();
        el.addEventListener("scroll", onScroll, { passive: true });

        recomputeStickiness();
        return () => el.removeEventListener("scroll", onScroll);
    }, [recomputeStickiness]);

    console.log("messages", messages);

    const hydrated = messages.map((m: any) => {
        const raw = (m as any).rawContent ?? m.content ?? "";
        const { segments } = extractUiSegments(raw);
        console.log("segments", m);
        return { ...m, role: m.role === 0 ? "user" : "assistant", rawContent: raw, segments };
    });

    return (
        <div className="w-full font-sans bg-hgray200 text-white h-screen min-w-[390px] max-w-[460px] lg:w-[30%] border-r border-white/10 flex flex-col">
            {/* Header (fixed) */}
            <div className="flex items-center justify-between flex-none h-14 px-4 text-hgray900">
                <div
                    className="text-sm font-medium flex items-center gap-1.5 hover:gap-2 cursor-pointer hover:text-hgray900 transition-all duration-200"
                >
                    <div>{title}</div>
                </div>
                <div>
                </div>
            </div>

            {/* Messages (scroll only here) */}
            <div className="flex-1 min-h-0 relative">
                <div ref={scrollRef} className="h-full overflow-y-auto pr-2 px-4 pt-4 pb-20">
                    <ChatMessageList
                        messages={hydrated}
                        isStreaming={false}
                        error={null}
                        onConfirmCriteriaCard={() => { }}
                        onChangeCriteriaCard={() => { }}
                    />
                    <br />
                </div>

                {showJumpToBottom && (
                    <button
                        type="button"
                        onClick={() => {
                            scrollToBottom("smooth");
                            setStickToBottom(true);
                            setShowJumpToBottom(false);
                        }}
                        className="absolute bottom-3 right-3 flex items-center gap-1 cursor-pointer rounded-full bg-white/5 hover:bg-white/10 px-2 py-2 text-xs text-hgray900"
                    >
                        <ArrowDown className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    )
}

export default React.memo(SharedChatPanel);