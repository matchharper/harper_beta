import {
  type ChangeEvent,
  type ReactNode,
  createContext,
  forwardRef,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { CardButton, MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownRichTextEditor } from "@/components/ui/markdown-rich-text-editor";
import RichText from "@/components/ui/rich-text";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/useToastStore";

export type DocumentEditorProps = Omit<
  TextareaProps,
  "className" | "unstyled" | "value"
> & {
  className?: string;
  documentTitle: string;
  editorClassName?: string;
  errorMessage?: string;
  format?: "markdown" | "plain";
  lastChangedAt?: string | null;
  onValueChange?: (value: string) => void;
  savedValue: string;
  value: string;
};

type DocumentEditorPanelContextValue = {
  activeDocumentId: string | null;
  closeDocument: () => void;
  openDocument: (documentId: string) => void;
  portalTarget: HTMLDivElement | null;
};

const DocumentEditorPanelContext =
  createContext<DocumentEditorPanelContextValue | null>(null);

/**
 * Makes document editing replace the surrounding panel instead of opening the
 * default right-side overlay. Keep this provider inside a positioned panel.
 */
export function DocumentEditorPanelProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const closeDocument = useCallback(() => setActiveDocumentId(null), []);
  const openDocument = useCallback(
    (documentId: string) => setActiveDocumentId(documentId),
    []
  );
  const contextValue = useMemo(
    () => ({
      activeDocumentId,
      closeDocument,
      openDocument,
      portalTarget,
    }),
    [activeDocumentId, closeDocument, openDocument, portalTarget]
  );

  return (
    <DocumentEditorPanelContext.Provider value={contextValue}>
      <div
        aria-hidden={activeDocumentId ? true : undefined}
        className="contents"
        inert={activeDocumentId ? true : undefined}
      >
        {children}
      </div>
      <div
        className={cn(
          "absolute inset-0 z-20 bg-bg-default",
          activeDocumentId ? "block" : "hidden"
        )}
        data-document-editor-panel=""
        ref={setPortalTarget}
      />
    </DocumentEditorPanelContext.Provider>
  );
}

const LAST_CHANGED_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  day: "numeric",
  month: "numeric",
  timeZone: "Asia/Seoul",
  year: "numeric",
});

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_DATE_THRESHOLD_DAYS = 10;

export function formatDocumentLastChangedAt(
  value: string | null | undefined,
  now = new Date()
) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const elapsedMs = Math.max(0, now.getTime() - date.getTime());
  if (elapsedMs < MINUTE_MS) return "방금 전";
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}분 전`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)}시간 전`;
  if (elapsedMs < RELATIVE_DATE_THRESHOLD_DAYS * DAY_MS) {
    return `${Math.floor(elapsedMs / DAY_MS)}일 전`;
  }

  return LAST_CHANGED_DATE_FORMATTER.format(date);
}

export function isDocumentPreviewOverflowing(
  scrollHeight: number,
  clientHeight: number
) {
  return scrollHeight > clientHeight + 1;
}

export async function copyDocumentText(
  value: string,
  clipboard: Pick<Clipboard, "writeText"> | null | undefined =
    typeof navigator === "undefined" ? undefined : navigator.clipboard
) {
  if (!clipboard?.writeText) {
    throw new Error("Clipboard API is unavailable");
  }

  await clipboard.writeText(value);
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

function DocumentMeta({
  changedAt,
  characterCount,
}: {
  changedAt: string;
  characterCount: number;
}) {
  return (
    <div
      className="text-right text-[12px] font-normal leading-4 text-black/40"
      data-document-editor-meta=""
      suppressHydrationWarning
    >
      마지막 변경: {changedAt}, {characterCount.toLocaleString("ko-KR")} 글자
    </div>
  );
}

function DocumentEditingSurface({
  autoFocus,
  changedAt,
  characterCount,
  documentTitle,
  editorClassName,
  errorMessage,
  format,
  forwardedRef,
  onBack,
  onChange,
  onCopy,
  onValueChange,
  textareaProps,
  value,
}: {
  autoFocus: boolean;
  changedAt: string;
  characterCount: number;
  documentTitle: string;
  editorClassName?: string;
  errorMessage?: string;
  format: "markdown" | "plain";
  forwardedRef: Ref<HTMLTextAreaElement> | undefined;
  onBack: () => void;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onCopy: () => void;
  onValueChange: (value: string) => void;
  textareaProps: Omit<TextareaProps, "onChange" | "value">;
  value: string;
}) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      internalRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef]
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-bg-default text-neutral-primary"
      data-inline-editable-interaction=""
    >
      <header className="flex h-14 flex-row items-center justify-between shrink-0 border-b border-neutral-1000-a05 px-3">
        <MuteButton onClick={onBack} type="button" variant="transparent">
          <ArrowLeft className="size-4" />
          <span className="text-[14px] font-normal text-black/50">
            {documentTitle}
          </span>
        </MuteButton>
        <MuteButton
          aria-label="문서 전체 내용 복사"
          className="text-black"
          onClick={onCopy}
          type="button"
          variant="transparent"
        >
          <Copy className="size-4" strokeWidth={1.8} />
        </MuteButton>
      </header>
      <div className="min-h-0 flex-1 px-5 py-4 sm:px-6">
        {format === "markdown" ? (
          <MarkdownRichTextEditor
            ariaLabel={
              textareaProps["aria-label"] ?? `${documentTitle} 문서 내용`
            }
            autoFocus={autoFocus}
            className={editorClassName}
            disabled={textareaProps.disabled}
            onValueChange={onValueChange}
            placeholder={textareaProps.placeholder}
            readOnly={textareaProps.readOnly}
            value={value}
          />
        ) : (
          <Textarea
            {...textareaProps}
            ref={setRef}
            aria-label={
              textareaProps["aria-label"] ?? `${documentTitle} 문서 내용`
            }
            autoFocus={autoFocus}
            className={cn(
              "h-full min-h-full w-full resize-none overflow-y-auto p-0 text-[16px] font-normal leading-7 text-neutral-primary outline-none placeholder:text-neutral-placeholder disabled:cursor-not-allowed disabled:text-neutral-disabled",
              editorClassName
            )}
            onChange={onChange}
            unstyled
            value={value}
          />
        )}
      </div>
      <footer className="shrink-0 border-t border-neutral-1000-a05 px-5 py-3 sm:px-6">
        {errorMessage ? (
          <div
            className="mb-2 text-[12px] leading-5 text-critical"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}
        <DocumentMeta changedAt={changedAt} characterCount={characterCount} />
      </footer>
    </div>
  );
}

/**
 * A compact document preview that opens a focused, full-height writing surface.
 * Inside DocumentEditorPanelProvider the editor takes over that panel; elsewhere
 * it slides in from the right.
 */
export const DocumentEditor = forwardRef<
  HTMLTextAreaElement,
  DocumentEditorProps
>(
  (
    {
      autoFocus,
      className,
      disabled,
      documentTitle,
      editorClassName,
      errorMessage,
      format = "plain",
      lastChangedAt,
      onChange,
      onValueChange,
      placeholder,
      readOnly,
      rows = 5,
      savedValue,
      value,
      ...props
    },
    forwardedRef
  ) => {
    const documentId = useId();
    const previewContentId = `${documentId}-preview-content`;
    const previewContentRef = useRef<HTMLDivElement | null>(null);
    const panelContext = useContext(DocumentEditorPanelContext);
    const addToast = useToastStore((state) => state.add);
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [localChangedAt, setLocalChangedAt] = useState<string | null>(null);
    const [previewExpanded, setPreviewExpanded] = useState(false);
    const [previewTruncated, setPreviewTruncated] = useState(false);
    const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now());
    const panelOpen = panelContext?.activeDocumentId === documentId;

    useEffect(() => {
      const intervalId = window.setInterval(
        () => setRelativeTimeNow(Date.now()),
        MINUTE_MS
      );
      return () => window.clearInterval(intervalId);
    }, []);

    useEffect(() => {
      if (!panelOpen) return;
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") panelContext?.closeDocument();
      };
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }, [panelContext, panelOpen]);

    const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
      setLocalChangedAt(new Date().toISOString());
      onChange?.(event);
    };
    const handleValueChange = (nextValue: string) => {
      setLocalChangedAt(new Date().toISOString());
      onValueChange?.(nextValue);
    };
    const handleCopy = () => {
      void copyDocumentText(value)
        .then(() => {
          addToast({
            message: "문서 내용을 복사했어요.",
            variant: "success",
          });
        })
        .catch(() => {
          addToast({
            message: "문서 내용을 복사하지 못했어요. 다시 시도해 주세요.",
            variant: "error",
          });
        });
    };
    const openEditor = () => {
      if (disabled) return;
      if (panelContext) {
        panelContext.openDocument(documentId);
      } else {
        setOverlayOpen(true);
      }
    };
    const displayedChangedAt = formatDocumentLastChangedAt(
      value === savedValue ? lastChangedAt : (localChangedAt ?? lastChangedAt),
      new Date(relativeTimeNow)
    );
    const characterCount = Array.from(value).length;
    const hasPreviewContent = value.trim().length > 0;
    const previewContent = hasPreviewContent
      ? value
      : placeholder?.trim() || "내용을 작성해 주세요.";

    useEffect(() => {
      const preview = previewContentRef.current;
      if (!preview || previewExpanded) return;

      const measureOverflow = () => {
        setPreviewTruncated(
          isDocumentPreviewOverflowing(
            preview.scrollHeight,
            preview.clientHeight
          )
        );
      };

      measureOverflow();
      window.addEventListener("resize", measureOverflow);
      const resizeObserver =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(measureOverflow);
      resizeObserver?.observe(preview);

      return () => {
        window.removeEventListener("resize", measureOverflow);
        resizeObserver?.disconnect();
      };
    }, [previewContent, previewExpanded]);

    const textareaProps: Omit<TextareaProps, "onChange" | "value"> = {
      ...props,
      disabled,
      placeholder,
      readOnly,
      rows,
    };
    const editingSurface = (
      <DocumentEditingSurface
        autoFocus={autoFocus ?? !readOnly}
        changedAt={displayedChangedAt}
        characterCount={characterCount}
        documentTitle={documentTitle}
        editorClassName={editorClassName}
        errorMessage={errorMessage}
        format={format}
        forwardedRef={forwardedRef}
        onBack={() => {
          if (panelContext) panelContext.closeDocument();
          else setOverlayOpen(false);
        }}
        onChange={handleChange}
        onCopy={handleCopy}
        onValueChange={handleValueChange}
        textareaProps={textareaProps}
        value={value}
      />
    );

    return (
      <div className={cn("w-full", className)}>
        <div
          className={cn(
            "group relative min-h-[340px] w-full overflow-hidden rounded-lg",
            previewExpanded ? "max-h-none" : "max-h-[440px]",
            disabled && "opacity-60"
          )}
        >
          <CardButton
            aria-label={`${documentTitle} 문서 열기`}
            aria-haspopup="dialog"
            className="absolute inset-0 h-full min-h-0 cursor-pointer overflow-hidden border-neutral-1000-a05 bg-white p-0 hover:border-neutral-1000-a05 hover:bg-neutral-100 group-hover:border-neutral-1000-a05 group-hover:bg-neutral-100 disabled:cursor-not-allowed"
            data-document-editor-preview=""
            disabled={disabled}
            onClick={openEditor}
            type="button"
          />
          <div className="pointer-events-none relative z-10 flex min-h-[340px] w-full flex-col justify-between px-5 py-4 text-left">
            <div>
              <span className="shrink-0 text-[12px] font-normal text-black/60">
                {documentTitle}
              </span>
              <div className="relative mt-4">
                <div
                  className={cn(
                    "min-h-20 w-full text-[15px] font-normal leading-6",
                    previewExpanded
                      ? "max-h-none overflow-visible"
                      : "max-h-[268px] overflow-hidden",
                    hasPreviewContent
                      ? "text-neutral-primary"
                      : "text-neutral-placeholder"
                  )}
                  id={previewContentId}
                  ref={previewContentRef}
                >
                  {hasPreviewContent && format === "markdown" ? (
                    <RichText content={previewContent} />
                  ) : (
                    <span className="whitespace-pre-wrap">
                      {previewContent}
                    </span>
                  )}
                </div>
                {!previewExpanded && previewTruncated ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 flex h-18 items-end bg-gradient-to-b from-transparent via-white/90 to-white group-hover:via-neutral-100/90 group-hover:to-neutral-100"
                    data-document-editor-preview-fade=""
                  >
                    <MuteButton
                      aria-controls={previewContentId}
                      aria-expanded={false}
                      className="pointer-events-auto w-full text-center"
                      onClick={() => setPreviewExpanded(true)}
                      size="sm"
                      type="button"
                      variant="transparent"
                    >
                      <ChevronDown className="size-3.5" />
                      더보기
                    </MuteButton>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-0 w-full shrink-0">
              {previewExpanded ? (
                <div className="pointer-events-auto mb-2 w-full text-center">
                  <MuteButton
                    aria-controls={previewContentId}
                    aria-expanded
                    className="w-full text-center"
                    onClick={() => setPreviewExpanded(false)}
                    size="sm"
                    type="button"
                    variant="transparent"
                  >
                    <ChevronUp className="size-3.5" />
                    접기
                  </MuteButton>
                </div>
              ) : null}
              <DocumentMeta
                changedAt={displayedChangedAt}
                characterCount={characterCount}
              />
            </div>
          </div>
        </div>

        {panelOpen && panelContext?.portalTarget
          ? createPortal(editingSurface, panelContext.portalTarget)
          : null}

        {!panelContext ? (
          <Dialog open={overlayOpen} onOpenChange={setOverlayOpen}>
            <DialogContent
              className="left-auto right-0 top-0 z-30 h-dvh w-full max-w-[680px] translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-y-0 border-r-0 p-0 duration-300 data-[state=closed]:slide-out-to-right data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-right data-[state=open]:zoom-in-100"
              hideCloseButton
              overlayClassName="z-30 bg-black/15 backdrop-blur-none"
            >
              <DialogTitle className="sr-only">{documentTitle}</DialogTitle>
              <DialogDescription className="sr-only">
                {documentTitle} 문서를 확인하고 수정합니다.
              </DialogDescription>
              {editingSurface}
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    );
  }
);

DocumentEditor.displayName = "DocumentEditor";
