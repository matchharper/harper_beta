import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { normalizeAttachmentLinkUrl } from "@/lib/chatAttachmentClient";
import { cn } from "@/lib/cn";
import { useMessages } from "@/i18n/useMessage";
import { Link2, Paperclip, Plus } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

type Props = {
  align?: "start" | "center" | "end";
  className?: string;
  disabled?: boolean;
  onAddFile: (file: File) => void;
  onAddLink: (url: string) => void;
};

export default function ChatAttachmentActionMenu({
  align = "start",
  className,
  disabled = false,
  onAddFile,
  onAddLink,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const { m } = useMessages();

  useEffect(() => {
    if (!isOpen) {
      setIsLinkEditorOpen(false);
      setLinkValue("");
      setLinkError("");
      return;
    }

    if (!isLinkEditorOpen) return;
    const timer = window.setTimeout(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    }, 20);

    return () => window.clearTimeout(timer);
  }, [isLinkEditorOpen, isOpen]);

  const submitLink = () => {
    try {
      const normalized = normalizeAttachmentLinkUrl(linkValue);
      onAddLink(normalized);
      setLinkValue("");
      setLinkError("");
      setIsLinkEditorOpen(false);
      setIsOpen(false);
    } catch (error) {
      setLinkError(
        error instanceof Error
          ? error.message
          : (m.chat.invalidLink ?? "유효한 링크를 입력해주세요.")
      );
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.txt,.md"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          if (file) {
            onAddFile(file);
          }
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }}
      />

      <ActionDropdown
        open={isOpen}
        onOpenChange={setIsOpen}
        align={align}
        side="top"
        contentClassName="w-[240px]"
        trigger={
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-white/5 text-hgray700 transition hover:bg-white/10 hover:text-hgray900 disabled:cursor-not-allowed disabled:opacity-40",
              className
            )}
            aria-label={m.chat.addAttachment ?? "첨부 추가"}
          >
            <Plus size={16} />
          </button>
        }
      >
        <ActionDropdownItem
          onSelect={() => {
            fileInputRef.current?.click();
          }}
          className="gap-2.5"
        >
          <Paperclip size={14} />
          <span>{m.chat.attachFile ?? "파일 첨부"}</span>
        </ActionDropdownItem>

        <ActionDropdownItem
          keepOpen
          onSelect={() => {
            setLinkError("");
            setIsLinkEditorOpen((prev) => !prev);
          }}
          className="gap-2.5"
        >
          <Link2 size={14} />
          <span>{m.chat.attachLink ?? "링크 입력"}</span>
        </ActionDropdownItem>

        {isLinkEditorOpen && (
          <div className="px-1 pb-1 pt-2">
            <div className="rounded-[12px] bg-white/[0.05] px-2 py-2">
              <input
                ref={linkInputRef}
                type="url"
                value={linkValue}
                onChange={(event) => {
                  setLinkValue(event.target.value);
                  if (linkError) setLinkError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitLink();
                  }
                }}
                placeholder={m.chat.linkPlaceholder ?? "https://example.com"}
                className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
              />
            </div>
            {linkError && (
              <div className="px-1 pt-2 text-[11px] text-red-300">
                {linkError}
              </div>
            )}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={submitLink}
                className={`inline-flex items-center justify-center rounded-sm ${linkValue ? "bg-accenta1 text-black" : "bg-white/10 text-white"} px-2.5 py-1 text-[11px] transition hover:bg-opacity-90`}
              >
                {m.chat.addLink ?? "링크 추가"}
              </button>
            </div>
          </div>
        )}
      </ActionDropdown>
    </>
  );
}
