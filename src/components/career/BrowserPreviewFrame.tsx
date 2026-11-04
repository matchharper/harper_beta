"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Maximize2, Minimize2, Monitor } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  BareButton,
  MuteButton,
  type MuteButtonProps,
} from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useLiveBrowserViewport } from "./useLiveBrowserViewport";

/** Shared presentation for Dev controls, application previews, and the session dock. */
export function BrowserPreviewSurface({
  liveUrl,
  loading = true,
  expanded = false,
  onExpand,
  title,
  status,
  interactive = false,
  showViewport = true,
  showViewportControls = true,
  headerActions,
  collapsed = false,
  children,
}: {
  liveUrl: string | null;
  loading?: boolean;
  expanded?: boolean;
  onExpand?: () => void;
  title: string;
  status?: string;
  interactive?: boolean;
  showViewport?: boolean;
  showViewportControls?: boolean;
  headerActions?: ReactNode;
  collapsed?: boolean;
  children?: ReactNode;
}) {
  const { iframeRef, ratio } = useLiveBrowserViewport(liveUrl);
  const t = useCareerT();
  const expand = t("career.application.browser.expand", "브라우저 화면 확대");
  return (
    <section className="flex flex-col gap-2.5 rounded-3xl bg-bg-weak p-2 shadow-(--shadow-xl)">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-1000-a05">
          <Monitor className="size-5 text-neutral-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium leading-5 text-neutral-primary">
            {onExpand ? (
              <BareButton
                className="w-full text-left"
                onClick={onExpand}
                aria-expanded={expanded}
              >
                {title}
              </BareButton>
            ) : (
              title
            )}
          </h3>
          {status ? <p className="text-xs text-action">{status}</p> : null}
        </div>
        {headerActions}
      </div>
      {showViewport ? (
        <div
          hidden={collapsed}
          className="relative aspect-video overflow-hidden rounded-xl border border-neutral-1000-a05 bg-bg-floating"
          style={interactive && ratio ? { aspectRatio: ratio } : undefined}
        >
          {/* Keep one iframe mounted across both sizes; no second viewer connection. */}
          <div
            inert={!interactive}
            aria-busy={Boolean(liveUrl && !ratio && loading)}
            className={`relative h-full w-full [container-type:size] ${interactive ? "" : "pointer-events-none"}`}
          >
            {liveUrl ? (
              <iframe
                ref={iframeRef}
                src={liveUrl}
                title={title}
                tabIndex={interactive ? 0 : -1}
                allow="autoplay"
                referrerPolicy="no-referrer"
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-0 ${interactive ? "" : "pointer-events-none"}`}
                // Match the remote viewport, then crop like object-fit: cover.
                // Styling object-fit on an iframe cannot change its inner viewer.
                style={{
                  width: ratio ? `max(100cqw, ${100 * ratio}cqh)` : "100%",
                  height: ratio ? `max(100cqh, ${100 / ratio}cqw)` : "100%",
                  opacity: ratio ? 1 : 0,
                }}
              />
            ) : null}
            {!ratio && loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-neutral-soft">
                <Loader2
                  className="size-5 animate-spin motion-reduce:animate-none"
                  aria-label={title}
                />
              </div>
            ) : null}
          </div>
          {onExpand && showViewportControls ? (
            expanded ? (
              <MuteButton
                className="absolute right-2 top-2 cursor-pointer"
                size="sm"
                aria-label={t(
                  "career.application.browser.collapse",
                  "브라우저 화면 축소"
                )}
                onClick={onExpand}
              >
                <Minimize2 className="size-4" />
              </MuteButton>
            ) : (
              <BareButton
                type="button"
                className="group absolute inset-0 cursor-pointer bg-surface-inverse/0 outline-none transition-colors duration-150 hover:bg-surface-inverse/10 focus-visible:bg-surface-inverse/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary motion-reduce:transition-none"
                aria-label={expand}
                aria-expanded={false}
                onClick={onExpand}
              >
                <span className="absolute bottom-2 right-2 rounded-sm bg-bg-floating/50 p-0.5 text-neutral-muted opacity-0 backdrop-blur-md transition-opacity duration-150 group-hover:opacity-60 group-focus-visible:opacity-60 motion-reduce:transition-none">
                  <Maximize2 className="size-4" />
                </span>
              </BareButton>
            )
          ) : null}
        </div>
      ) : null}
      <div hidden={collapsed} className="space-y-2.5">
        {children}
      </div>
    </section>
  );
}

export function BrowserPreviewAction(props: MuteButtonProps) {
  return (
    <MuteButton
      {...props}
      variant="dark"
      size="lg"
      className="w-full cursor-pointer rounded-pill border-stroke-strong bg-surface-inverse hover:border-stroke-strong hover:bg-surface-inverse/90"
    />
  );
}

export function BrowserPreviewFrame({
  liveUrl,
  loading = true,
}: {
  liveUrl: string | null;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = useCareerT();
  const title = t("career.application.browser.preview", "브라우저 미리보기");
  return (
    <Popover open={expanded} onOpenChange={setExpanded}>
      <PopoverAnchor className="absolute right-0 top-0 h-0 w-0" />
      <PopoverContent
        surface={false}
        forceMount
        side="top"
        align="end"
        sideOffset={12}
        collisionPadding={16}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        aria-label={title}
        className="z-80 max-h-[calc(100dvh-32px)] overflow-y-auto rounded-3xl shadow-(--shadow-xl)"
        style={{
          width: expanded
            ? "min(720px, calc(100vw - 32px))"
            : "min(320px, calc(100vw - 32px))",
        }}
      >
        <BrowserPreviewSurface
          liveUrl={liveUrl}
          loading={loading}
          expanded={expanded}
          onExpand={() => setExpanded(!expanded)}
          title={t("career.application.browser.title", "Harper의 브라우저")}
          status={t(
            "career.application.browser.checking",
            "지원 정보 확인 중..."
          )}
        >
          <BrowserPreviewAction
            disabled={!liveUrl}
            onClick={() => {
              if (!liveUrl) return;
              const url = new URL(liveUrl);
              url.searchParams.set("readOnly", "false");
              url.searchParams.set("ui", "true");
              window.open(url.toString(), "_blank", "noopener,noreferrer");
            }}
          >
            {t("career.application.browser.open", "브라우저 열기")}
          </BrowserPreviewAction>
        </BrowserPreviewSurface>
      </PopoverContent>
    </Popover>
  );
}
