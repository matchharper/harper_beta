"use client";

import React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import Animate from "../landing/Animate";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useToastStore, type ToastItem } from "@/store/useToastStore";

function normalizeToastMessage(message: string) {
  return String(message ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

export default function ToastProvider() {
  const mounted = useIsMounted();
  const list = useToastStore((s) => s.list);
  const remove = useToastStore((s) => s.remove);

  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-9999 flex justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        {list.map((t) => (
          <Toast key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </div>,
    document.body
  );
}

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const Icon =
    item.variant === "success"
      ? CheckCircle2
      : item.variant === "error"
        ? XCircle
        : null;

  return (
    <Animate
      duration={0.3}
      isSpring={true}
      triggerOnce={true}
      className={[
        "pointer-events-auto flex items-center gap-2 rounded-toast border-(length:--surface-border-width) px-4 py-2 text-xs sm:text-sm shadow-(--shadow-toast) backdrop-blur-toast",
        item.variant === "dark"
          ? "border-surface-inverse bg-surface-inverse text-on-inverse"
          : item.variant === "success"
            ? "border-toast-border bg-toast bg-toast-image text-toast-foreground"
            : item.variant === "error"
              ? "border-critical/30 bg-critical-faded text-critical"
              : item.variant === "white"
                ? "border-toast-border bg-toast bg-toast-image text-toast-foreground"
                : "border-toast-border bg-toast bg-toast-image text-toast-foreground",
        "",
      ].join(" ")}
      aria-live="polite"
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-90" /> : null}
      <span className="flex-1 whitespace-pre-wrap wrap-break-word">
        {normalizeToastMessage(item.message)}
      </span>
      {item.actions?.map((action) => (
        <button
          className="shrink-0 rounded-sm px-1 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-current"
          key={action.label}
          onClick={() => {
            action.onClick();
            onClose();
          }}
          type="button"
        >
          {action.label}
        </button>
      ))}
    </Animate>
  );
}
