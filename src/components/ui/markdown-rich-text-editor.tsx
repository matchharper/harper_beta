import { Image } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  ChevronDown,
  Code2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
  Trash2,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MuteButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

type TextBlockStyle = "paragraph" | "heading-2" | "heading-3";

const TEXT_BLOCK_STYLE_OPTIONS: Array<{
  label: string;
  value: TextBlockStyle;
}> = [
  { label: "본문", value: "paragraph" },
  { label: "큰 제목", value: "heading-2" },
  { label: "작은 제목", value: "heading-3" },
];

export function resolveMarkdownBubbleMenuContainer(
  editorElement: HTMLElement,
  editorContainer: HTMLElement | null
) {
  return (
    editorElement.closest<HTMLElement>('[role="dialog"]') ??
    editorContainer ??
    editorElement.parentElement ??
    document.body
  );
}

export function shouldShowMarkdownBubbleMenu({
  codeBlockActive,
  editable,
  editorFocused,
  menuFocused,
  selectionEmpty,
}: {
  codeBlockActive: boolean;
  editable: boolean;
  editorFocused: boolean;
  menuFocused: boolean;
  selectionEmpty: boolean;
}) {
  return (
    editable &&
    !selectionEmpty &&
    (editorFocused || menuFocused) &&
    !codeBlockActive
  );
}

export function shouldEmitMarkdownEditorUpdate(transaction: {
  docChanged: boolean;
}) {
  return transaction.docChanged;
}

export function normalizeMarkdownEditorLinkHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const candidate = EMAIL_PATTERN.test(trimmed)
    ? `mailto:${trimmed}`
    : URL_SCHEME_PATTERN.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol) ? candidate : null;
  } catch {
    return null;
  }
}

export function createMarkdownEditorExtensions() {
  return [
    StarterKit.configure({
      link: {
        defaultProtocol: "https",
        enableClickSelection: true,
        markdownLinks: true,
        openOnClick: false,
      },
      trailingNode: false,
      underline: false,
    }),
    Image.configure({
      allowBase64: false,
      resize: false,
    }),
    TableKit.configure({
      table: { resizable: false },
    }),
    Markdown.configure({
      indentation: { size: 2, style: "space" },
      markedOptions: { breaks: false, gfm: true },
    }),
  ];
}

function FormatButton({
  active,
  ariaLabel,
  disabled,
  icon,
  onClick,
  title,
}: {
  active?: boolean;
  ariaLabel: string;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <MuteButton
      aria-label={ariaLabel}
      aria-pressed={active}
      className="rounded-[5px]"
      disabled={disabled}
      onClick={onClick}
      size="sm"
      title={title}
      type="button"
      variant={active ? "neutral" : "transparent"}
    >
      {icon}
    </MuteButton>
  );
}

export function MarkdownRichTextEditor({
  ariaLabel,
  autoFocus = false,
  className,
  disabled = false,
  onValueChange,
  placeholder,
  readOnly = false,
  value,
}: {
  ariaLabel: string;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
}) {
  const editable = !disabled && !readOnly;
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const onValueChangeRef = useRef(onValueChange);
  const textBlockMenuOpenRef = useRef(false);
  const [editingLink, setEditingLink] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linkValue, setLinkValue] = useState("");

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  const editor = useEditor(
    {
      content: value,
      contentType: "markdown",
      editable,
      editorProps: {
        attributes: {
          "aria-label": ariaLabel,
          class: "tiptap",
          role: "textbox",
          spellcheck: "true",
        },
      },
      extensions: createMarkdownEditorExtensions(),
      immediatelyRender: false,
      onSelectionUpdate: () => {
        setEditingLink(false);
        setLinkError("");
      },
      onUpdate: ({ editor: currentEditor, transaction }) => {
        if (!shouldEmitMarkdownEditorUpdate(transaction)) return;
        onValueChangeRef.current(currentEditor.getMarkdown());
      },
    },
    []
  );

  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      code: currentEditor?.isActive("code") ?? false,
      empty: currentEditor?.isEmpty ?? true,
      heading2: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      heading3: currentEditor?.isActive("heading", { level: 3 }) ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      link: currentEditor?.isActive("link") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
      strike: currentEditor?.isActive("strike") ?? false,
    }),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || editor.getMarkdown() === value) return;
    editor.commands.setContent(value, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, value]);

  useEffect(() => {
    if (!autoFocus || !editable || !editor) return;
    const frame = window.requestAnimationFrame(() => editor.commands.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, editable, editor]);

  const openLinkEditor = useCallback(() => {
    if (!editor || editor.state.selection.empty) return;
    setLinkValue(String(editor.getAttributes("link").href ?? ""));
    setLinkError("");
    setEditingLink(true);
  }, [editor]);

  useEffect(() => {
    if (!editor || !editable) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !editor.state.selection.empty
      ) {
        event.preventDefault();
        openLinkEditor();
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener("keydown", handleKeyDown);
    return () => editorElement.removeEventListener("keydown", handleKeyDown);
  }, [editable, editor, openLinkEditor]);

  const submitLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;

    const href = normalizeMarkdownEditorLinkHref(linkValue);
    if (href === null) {
      setLinkError("http(s) 주소나 이메일을 입력해 주세요.");
      return;
    }

    const chain = editor.chain().focus();
    if (!href) {
      chain.extendMarkRange("link").unsetLink().run();
    } else if (editor.isActive("link")) {
      chain.extendMarkRange("link").setLink({ href }).run();
    } else {
      chain.setLink({ href }).run();
    }
    setEditingLink(false);
    setLinkError("");
  };

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setEditingLink(false);
    setLinkError("");
  };

  if (!editor) {
    return (
      <div
        ref={editorContainerRef}
        aria-label={ariaLabel}
        className={cn("min-h-[240px]", className)}
        role="textbox"
      />
    );
  }

  const textBlockStyle: TextBlockStyle = editorState?.heading2
    ? "heading-2"
    : editorState?.heading3
      ? "heading-3"
      : "paragraph";
  const textBlockStyleLabel =
    TEXT_BLOCK_STYLE_OPTIONS.find((option) => option.value === textBlockStyle)
      ?.label ?? "본문";

  const applyTextBlockStyle = (style: TextBlockStyle) => {
    const chain = editor.chain().focus();
    if (style === "heading-2") {
      chain.setHeading({ level: 2 }).run();
      return;
    }
    if (style === "heading-3") {
      chain.setHeading({ level: 3 }).run();
      return;
    }
    chain.setParagraph().run();
  };

  return (
    <div
      ref={editorContainerRef}
      className={cn(
        "relative flex h-full min-h-[240px] w-full flex-col",
        disabled && "opacity-60",
        className
      )}
      data-markdown-rich-text-editor=""
    >
      {editable ? (
        <BubbleMenu
          editor={editor}
          appendTo={() =>
            resolveMarkdownBubbleMenuContainer(
              editor.view.dom,
              editorContainerRef.current
            )
          }
          className="z-[60]"
          data-inline-editable-interaction=""
          options={{
            flip: true,
            offset: 8,
            placement: "top",
            shift: { padding: 8 },
            strategy: "absolute",
          }}
          shouldShow={({ editor: currentEditor, element, view }) =>
            shouldShowMarkdownBubbleMenu({
              codeBlockActive: currentEditor.isActive("codeBlock"),
              editable: currentEditor.isEditable,
              editorFocused: view.hasFocus(),
              menuFocused:
                textBlockMenuOpenRef.current ||
                element.contains(document.activeElement),
              selectionEmpty: currentEditor.state.selection.empty,
            })
          }
          updateDelay={0}
        >
          {editingLink ? (
            <form
              className="w-[min(360px,calc(100vw-24px))] rounded-lg border border-neutral-1000-a10 bg-bg-floating p-2 shadow-lg"
              onSubmit={submitLink}
            >
              <div className="flex items-center gap-1.5">
                <Input
                  aria-label="링크 주소"
                  autoFocus
                  className="h-8 min-w-0 flex-1 px-2 text-[13px]"
                  onChange={(event) => {
                    setLinkValue(event.target.value);
                    setLinkError("");
                  }}
                  placeholder="https://example.com"
                  value={linkValue}
                />
                <MuteButton size="sm" type="submit" variant="dark">
                  적용
                </MuteButton>
                {editorState?.link ? (
                  <MuteButton
                    aria-label="링크 제거"
                    onClick={removeLink}
                    size="sm"
                    title="링크 제거"
                    type="button"
                    variant="transparent"
                  >
                    <Trash2 className="size-3.5" />
                  </MuteButton>
                ) : null}
              </div>
              {linkError ? (
                <p
                  className="mt-1.5 px-0.5 text-[11px] text-critical"
                  role="alert"
                >
                  {linkError}
                </p>
              ) : null}
            </form>
          ) : (
            <div className="flex items-center gap-0.5 rounded-lg border border-neutral-1000-a10 bg-bg-floating p-1 shadow-lg">
              <DropdownMenu
                modal={false}
                onOpenChange={(open) => {
                  textBlockMenuOpenRef.current = open;
                }}
              >
                <DropdownMenuTrigger asChild>
                  <MuteButton
                    aria-label={`문단 서식: ${textBlockStyleLabel}`}
                    size="sm"
                    title="문단 서식"
                    type="button"
                    variant="transparent"
                  >
                    <span className="min-w-12 text-left">
                      {textBlockStyleLabel}
                    </span>
                    <ChevronDown className="size-3.5" />
                  </MuteButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="min-w-32"
                  data-inline-editable-interaction=""
                  portalled={false}
                  side="bottom"
                  sideOffset={6}
                >
                  {TEXT_BLOCK_STYLE_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onSelect={() => applyTextBlockStyle(option.value)}
                      selected={textBlockStyle === option.value}
                      variant="sm"
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span
                aria-hidden="true"
                className="mx-0.5 h-5 w-px bg-neutral-1000-a10"
              />
              <FormatButton
                active={editorState?.bold}
                ariaLabel="굵게"
                icon={<Bold className="size-3.5" />}
                onClick={() => editor.chain().focus().toggleBold().run()}
                title="굵게 (⌘/Ctrl+B)"
              />
              <FormatButton
                active={editorState?.italic}
                ariaLabel="기울임"
                icon={<Italic className="size-3.5" />}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                title="기울임 (⌘/Ctrl+I)"
              />
              <FormatButton
                active={editorState?.strike}
                ariaLabel="취소선"
                icon={<Strikethrough className="size-3.5" />}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                title="취소선"
              />
              <FormatButton
                active={editorState?.code}
                ariaLabel="인라인 코드"
                icon={<Code2 className="size-3.5" />}
                onClick={() => editor.chain().focus().toggleCode().run()}
                title="인라인 코드"
              />
              <FormatButton
                active={editorState?.link}
                ariaLabel="링크"
                disabled={editor.state.selection.empty}
                icon={<Link2 className="size-3.5" />}
                onClick={openLinkEditor}
                title="링크 (⌘/Ctrl+K)"
              />
              <span
                aria-hidden="true"
                className="mx-0.5 h-5 w-px bg-neutral-1000-a10"
              />
              <FormatButton
                active={editorState?.bulletList}
                ariaLabel="글머리 기호 목록"
                icon={<List className="size-3.5" />}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                title="글머리 기호 목록"
              />
              <FormatButton
                active={editorState?.orderedList}
                ariaLabel="번호 목록"
                icon={<ListOrdered className="size-3.5" />}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                title="번호 목록"
              />
            </div>
          )}
        </BubbleMenu>
      ) : null}

      {editorState?.empty && placeholder ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 text-[16px] leading-7 text-neutral-placeholder">
          {placeholder}
        </div>
      ) : null}

      <EditorContent
        editor={editor}
        className={cn(
          "min-h-0 w-full flex-1 overflow-y-auto text-[16px] font-normal leading-7 text-neutral-primary",
          "[&_.tiptap]:min-h-full [&_.tiptap]:outline-none",
          "[&_.tiptap_p]:mt-3 [&_.tiptap_p:first-child]:mt-0",
          "[&_.tiptap_h1]:mt-6 [&_.tiptap_h1]:text-[22px] [&_.tiptap_h1]:font-semibold [&_.tiptap_h1]:leading-8 [&_.tiptap_h1:first-child]:mt-0",
          "[&_.tiptap_h2]:mt-5 [&_.tiptap_h2]:text-[19px] [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:leading-7 [&_.tiptap_h2:first-child]:mt-0",
          "[&_.tiptap_h3]:mt-5 [&_.tiptap_h3]:text-[17px] [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:leading-7 [&_.tiptap_h3:first-child]:mt-0",
          "[&_.tiptap_ul]:my-3 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6",
          "[&_.tiptap_ol]:my-3 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6",
          "[&_.tiptap_li]:pl-1 [&_.tiptap_li_p]:mt-0",
          "[&_.tiptap_a]:cursor-pointer [&_.tiptap_a]:underline [&_.tiptap_a]:decoration-dotted [&_.tiptap_a]:underline-offset-4",
          "[&_.tiptap_code]:rounded [&_.tiptap_code]:bg-bg-weak [&_.tiptap_code]:px-1.5 [&_.tiptap_code]:py-0.5 [&_.tiptap_code]:font-mono [&_.tiptap_code]:text-[13px]",
          "[&_.tiptap_pre]:my-4 [&_.tiptap_pre]:overflow-x-auto [&_.tiptap_pre]:rounded-lg [&_.tiptap_pre]:bg-bg-weak [&_.tiptap_pre]:p-4",
          "[&_.tiptap_pre_code]:bg-transparent [&_.tiptap_pre_code]:p-0",
          "[&_.tiptap_blockquote]:my-4 [&_.tiptap_blockquote]:border-l-2 [&_.tiptap_blockquote]:border-neutral-1000-a10 [&_.tiptap_blockquote]:pl-4 [&_.tiptap_blockquote]:text-neutral-muted",
          "[&_.tiptap_hr]:my-5 [&_.tiptap_hr]:border-neutral-1000-a10",
          "[&_.tiptap_table]:my-4 [&_.tiptap_table]:w-full [&_.tiptap_table]:border-collapse [&_.tiptap_table]:text-[14px]",
          "[&_.tiptap_td]:border [&_.tiptap_td]:border-neutral-1000-a10 [&_.tiptap_td]:p-2",
          "[&_.tiptap_th]:border [&_.tiptap_th]:border-neutral-1000-a10 [&_.tiptap_th]:bg-bg-weak [&_.tiptap_th]:p-2 [&_.tiptap_th]:text-left [&_.tiptap_th]:font-medium",
          "[&_.tiptap_img]:my-4 [&_.tiptap_img]:max-w-full [&_.tiptap_img]:rounded-lg"
        )}
      />

      {editable ? (
        <p className="pointer-events-none mt-2 shrink-0 text-[11px] leading-4 text-neutral-soft">
          텍스트를 선택하면 서식을 적용할 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}
