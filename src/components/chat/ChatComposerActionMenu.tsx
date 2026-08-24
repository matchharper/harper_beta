"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CHAT_COMPOSER_PICKER_SURFACE_CLASS_NAME,
  ChatComposerPickerItemContent,
  type ChatComposerPickerItem,
  type ChatComposerPickerItemLayout,
} from "@/components/chat/ChatComposerPicker";
import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useRef, useState } from "react";

export type ChatComposerActionMenuItem = {
  disabled?: boolean;
  icon: ReactNode;
  id: string;
  label: string;
  loading?: boolean;
  onSelect: () => void;
  sectionLabel?: string;
  subtext?: string;
  subtextLayout?: ChatComposerPickerItemLayout;
  trailingText?: string;
};

type ChatComposerActionMenuProps = {
  align?: "start" | "center" | "end";
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  items: ChatComposerActionMenuItem[];
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  sideOffset?: number;
  trigger?: ReactNode;
};

export function ChatComposerActionMenu({
  align = "start",
  className,
  contentClassName,
  disabled = false,
  items,
  onOpenChange,
  open: controlledOpen,
  sideOffset = 10,
  trigger,
}: ChatComposerActionMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const openedWithPointerRef = useRef(false);
  const open = controlledOpen ?? internalOpen;

  const handleOpenChange = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <MuteButton
            aria-label="추가 메뉴 열기"
            className={cn("rounded-full text-neutral-muted", className)}
            disabled={disabled}
            onPointerDown={() => {
              openedWithPointerRef.current = true;
            }}
            size="md"
            type="button"
            variant="transparent"
          >
            <Plus className="h-5 w-5" />
          </MuteButton>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side="top"
        sideOffset={sideOffset}
        onCloseAutoFocus={(event) => {
          if (!openedWithPointerRef.current) return;
          event.preventDefault();
          window.requestAnimationFrame(() => {
            openedWithPointerRef.current = false;
          });
        }}
        className={cn(
          "w-[min(320px,calc(100vw-32px))] p-0 text-neutral-primary",
          CHAT_COMPOSER_PICKER_SURFACE_CLASS_NAME,
          "data-[state=open]:duration-200 data-[state=closed]:duration-150 data-[state=closed]:slide-out-to-bottom-2 data-[side=top]:slide-in-from-bottom-3",
          contentClassName
        )}
      >
        <div className="min-h-0 overflow-y-auto px-1 py-1">
          {items.map((item, index) => {
            const previousSection = items[index - 1]?.sectionLabel;
            const showSection =
              Boolean(item.sectionLabel) &&
              item.sectionLabel !== previousSection;
            const pickerItem: ChatComposerPickerItem = {
              disabled: item.disabled || item.loading,
              icon: item.loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                item.icon
              ),
              id: item.id,
              onSelect: item.onSelect,
              subText: item.subtext,
              text: item.label,
              trailingText: item.trailingText,
              type: "action",
            };

            return (
              <Fragment key={item.id}>
                {showSection ? (
                  <>
                    {index > 0 ? (
                      <DropdownMenuSeparator className="mx-1 my-1" />
                    ) : null}
                    <DropdownMenuLabel className="flex h-8 w-full items-center overflow-hidden whitespace-nowrap px-2 py-0 font-normal text-black/50">
                      <ChatComposerPickerItemContent
                        item={{
                          id: `section-${item.sectionLabel}`,
                          text: item.sectionLabel ?? "",
                          type: "text",
                        }}
                      />
                    </DropdownMenuLabel>
                  </>
                ) : null}
                <DropdownMenuItem
                  className={cn(
                    "mb-0.5 flex w-full cursor-pointer flex-row items-center justify-start gap-0 overflow-hidden whitespace-nowrap rounded-lg border-0 px-2 text-left shadow-none last:mb-0 focus-visible:ring-inset focus-visible:ring-offset-0",
                    item.subtextLayout === "stacked"
                      ? "min-h-12 py-1.5"
                      : "h-8 py-0"
                  )}
                  disabled={pickerItem.disabled}
                  onPointerDown={(event) => event.preventDefault()}
                  onSelect={item.onSelect}
                  variant="sm"
                >
                  <ChatComposerPickerItemContent
                    item={pickerItem}
                    layout={item.subtextLayout}
                  />
                </DropdownMenuItem>
              </Fragment>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
