import { useRef } from "react";
import { Bold, Italic, Link2, List, Underline } from "lucide-react";

type FormatAction = "bold" | "italic" | "link" | "list" | "underline";

type ApplyFormatResult = {
  nextSelectionEnd: number;
  nextSelectionStart: number;
  value: string;
};

type AtsEmailBodyEditorProps = {
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  textareaClassName: string;
  value: string;
};

function wrapSelection(args: {
  after: string;
  before: string;
  fallback: string;
  selectionEnd: number;
  selectionStart: number;
  value: string;
}) {
  const selected = args.value.slice(args.selectionStart, args.selectionEnd);
  const content = selected || args.fallback;
  const value =
    args.value.slice(0, args.selectionStart) +
    args.before +
    content +
    args.after +
    args.value.slice(args.selectionEnd);
  const contentStart = args.selectionStart + args.before.length;
  return {
    nextSelectionEnd: contentStart + content.length,
    nextSelectionStart: contentStart,
    value,
  } satisfies ApplyFormatResult;
}

function applyFormatAction(args: {
  action: FormatAction;
  selectionEnd: number;
  selectionStart: number;
  value: string;
}) {
  if (args.action === "bold") {
    return wrapSelection({
      after: "**",
      before: "**",
      fallback: "bold text",
      selectionEnd: args.selectionEnd,
      selectionStart: args.selectionStart,
      value: args.value,
    });
  }

  if (args.action === "italic") {
    return wrapSelection({
      after: "*",
      before: "*",
      fallback: "italic text",
      selectionEnd: args.selectionEnd,
      selectionStart: args.selectionStart,
      value: args.value,
    });
  }

  if (args.action === "underline") {
    return wrapSelection({
      after: "</u>",
      before: "<u>",
      fallback: "underlined text",
      selectionEnd: args.selectionEnd,
      selectionStart: args.selectionStart,
      value: args.value,
    });
  }

  if (args.action === "link") {
    const selected = args.value.slice(args.selectionStart, args.selectionEnd);
    const label = selected || "link text";
    const url = "https://";
    const inserted = `[${label}](${url})`;
    const value =
      args.value.slice(0, args.selectionStart) +
      inserted +
      args.value.slice(args.selectionEnd);
    const urlStart = args.selectionStart + label.length + 3;
    return {
      nextSelectionEnd: urlStart + url.length,
      nextSelectionStart: urlStart,
      value,
    } satisfies ApplyFormatResult;
  }

  const selected = args.value.slice(args.selectionStart, args.selectionEnd);
  if (!selected) {
    const inserted = "- ";
    return {
      nextSelectionEnd: args.selectionStart + inserted.length,
      nextSelectionStart: args.selectionStart + inserted.length,
      value:
        args.value.slice(0, args.selectionStart) +
        inserted +
        args.value.slice(args.selectionEnd),
    } satisfies ApplyFormatResult;
  }

  const prefixed = selected
    .split("\n")
    .map((line) => (line.trim() ? `- ${line}` : line))
    .join("\n");
  return {
    nextSelectionEnd: args.selectionStart + prefixed.length,
    nextSelectionStart: args.selectionStart,
    value:
      args.value.slice(0, args.selectionStart) +
      prefixed +
      args.value.slice(args.selectionEnd),
  } satisfies ApplyFormatResult;
}

export default function AtsEmailBodyEditor({
  onChange,
  placeholder,
  rows = 12,
  textareaClassName,
  value,
}: AtsEmailBodyEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleFormat = (action: FormatAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const next = applyFormatAction({
      action,
      selectionEnd: textarea.selectionEnd,
      selectionStart: textarea.selectionStart,
      value,
    });
    onChange(next.value);

    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(next.nextSelectionStart, next.nextSelectionEnd);
    });
  };

  const toolbarButtonClass =
    "inline-flex h-8 items-center gap-1 rounded-md border border-beige900/8 bg-beige500/55 px-2.5 text-xs text-beige900/80 transition hover:bg-beige500/70 hover:text-beige900";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleFormat("bold")}
          className={toolbarButtonClass}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
          Bold
        </button>
        <button
          type="button"
          onClick={() => handleFormat("italic")}
          className={toolbarButtonClass}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
          Italic
        </button>
        <button
          type="button"
          onClick={() => handleFormat("underline")}
          className={toolbarButtonClass}
          title="Underline"
        >
          <Underline className="h-3.5 w-3.5" />
          Underline
        </button>
        <button
          type="button"
          onClick={() => handleFormat("link")}
          className={toolbarButtonClass}
          title="Link"
        >
          <Link2 className="h-3.5 w-3.5" />
          Link
        </button>
        <button
          type="button"
          onClick={() => handleFormat("list")}
          className={toolbarButtonClass}
          title="Bullet List"
        >
          <List className="h-3.5 w-3.5" />
          List
        </button>
      </div>
      <div className="text-xs text-beige900/45">
        `**bold**`, `*italic*`, `<u>underline</u>`, `[label](https://...)`,
        `- list` 를 지원합니다.
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={textareaClassName}
      />
    </div>
  );
}
