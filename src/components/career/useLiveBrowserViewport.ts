import { useEffect, useRef, useState } from "react";

/** Browser Use reports its viewport once the live viewer is connected. */
export function useLiveBrowserViewport(liveUrl: string | null | undefined) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewport, setViewport] = useState<{ url: string; ratio: number } | null>(null);
  useEffect(() => {
    if (!liveUrl) return;
    const onViewport = (event: MessageEvent) => {
      if (event.origin !== "https://live.browser-use.com" || event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (data?.type !== "browser-use:viewport"
        || typeof data.width !== "number" || typeof data.height !== "number"
        || !Number.isFinite(data.width) || !Number.isFinite(data.height)
        || data.width <= 0 || data.height <= 0) return;
      const ratio = data.width / data.height;
      setViewport(previous => previous?.url === liveUrl && previous.ratio === ratio ? previous : { url: liveUrl, ratio });
    };
    window.addEventListener("message", onViewport);
    return () => window.removeEventListener("message", onViewport);
  }, [liveUrl]);
  return { iframeRef, ratio: viewport && viewport.url === liveUrl ? viewport.ratio : undefined };
}
