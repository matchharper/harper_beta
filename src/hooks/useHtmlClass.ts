import { useEffect } from "react";

export function useHtmlClass(className: string, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const html = document.documentElement;
    html.classList.add(className);
    return () => {
      html.classList.remove(className);
    };
  }, [className, enabled]);
}
