"use client";

import React from "react";
import { createPortal } from "react-dom";
import { setToast, ToastOptions } from "./toast";
import { CheckCircle2, XCircle, X } from "lucide-react";
import Animate from "../landing/Animate";

type Item = {
  id: string;
  message: string;
  variant: "default" | "success" | "error" | "white";
  ttl: number;
};

export default function ToastProvider() {
  const [mounted, setMounted] = React.useState(false);
  const [list, setList] = React.useState<Item[]>([]);

  // ✅ 클라이언트 마운트 이후에만 포털 렌더
  React.useEffect(() => {
    setMounted(true);

    // facade 연결도 마운트 후에
    setToast((input: ToastOptions | string) => {
      const opts: ToastOptions =
        typeof input === "string" ? { message: input } : input;

      const id = opts.id ?? Math.random().toString(36).slice(2);
      const duration = opts.duration ?? 3000;

      setList((prev) => [
        ...prev,
        {
          id,
          message: opts.message,
          variant: opts.variant ?? "default",
          ttl: duration,
        },
      ]);

      window.setTimeout(() => {
        setList((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    });
  }, []);

  if (!mounted) return null; // 👈 서버/첫 hydration과 동일한 출력 보장

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[9999] flex justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        {list.map((t) => (
          <Toast
            key={t.id}
            item={t}
            onClose={() => setList((p) => p.filter((x) => x.id !== t.id))}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}

function Toast({ item, onClose }: { item: Item; onClose: () => void }) {
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
        "pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2 text-xs sm:text-sm shadow-lg backdrop-blur",
        item.variant === "success"
          ? "border-green-400/20 bg-green-400/10 text-green-100"
          : item.variant === "error"
          ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
          : item.variant === "white"
          ? "border-white/100 bg-white/80 text-black"
          : "border-xopp/15 bg-xopp/10 text-white/90",
        "",
      ].join(" ")}
      aria-live="polite"
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-90" /> : null}
      <span className="flex-1">{item.message}</span>
      {/* <button
        onClick={onClose}
        className="rounded-full p-1 hover:bg-xopp/10"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button> */}
    </Animate>
  );
}
