// hooks/chat/useAutoScroll.ts
import { useEffect, useRef } from "react";

type Args = {
  enabled: boolean;
  deps: unknown[];
};

export function useAutoScroll({ enabled, deps }: Args) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { endRef };
}
