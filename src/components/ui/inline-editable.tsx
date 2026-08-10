import {
  type ComponentProps,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type InlineEditableCommonProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  displayClassName?: string;
  displayValue?: ReactNode;
  editing: boolean;
  emptyText?: string;
  inline?: boolean;
  onEdit: () => void;
};

export function InlineEditableValue({
  alwaysShowEditor = false,
  ariaLabel,
  className,
  disabled = false,
  displayClassName,
  displayValue,
  editing,
  editor,
  inline = false,
  onEdit,
}: Omit<InlineEditableCommonProps, "emptyText"> & {
  alwaysShowEditor?: boolean;
  editor: ReactNode;
}) {
  const Component = inline ? "span" : "div";
  const editorClassName = inline ? "inline-flex" : "w-full";
  const viewingClassName = inline
    ? "inline-flex max-w-full items-center rounded-md px-1"
    : "min-h-10 w-full rounded-md px-3 py-2 text-sm font-normal text-neutral-primary";

  if (editing || alwaysShowEditor) {
    return (
      <Component
        className={cn("min-w-0", editorClassName, className)}
        data-inline-editable-interaction=""
      >
        {editor}
      </Component>
    );
  }

  if (disabled) {
    return (
      <Component
        className={cn("min-w-0", viewingClassName, className, displayClassName)}
        data-inline-editable-interaction=""
      >
        {displayValue}
      </Component>
    );
  }

  return (
    <Component
      aria-label={ariaLabel}
      className={cn(
        "cursor-pointer text-left outline-none transition-colors leading-[22px] border border-neutral-1000-a05 hover:bg-bg-basement focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
        viewingClassName,
        className,
        displayClassName
      )}
      data-inline-editable-interaction=""
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onEdit();
      }}
      role="button"
      tabIndex={0}
    >
      {displayValue}
    </Component>
  );
}

function defaultDisplayValue(
  value: string | number | null | undefined,
  emptyText: string
) {
  const text = String(value ?? "").trim();
  return text ? (
    <span className="whitespace-pre-wrap wrap-break-word">{text}</span>
  ) : (
    <span className="text-neutral-soft">{emptyText}</span>
  );
}

export function InlineEditableInput({
  ariaLabel,
  className,
  disabled = false,
  displayClassName,
  displayValue,
  editing,
  emptyText = "-",
  inline,
  inputClassName,
  onEdit,
  value,
  ...inputProps
}: InlineEditableCommonProps &
  Omit<ComponentProps<typeof Input>, "disabled" | "value"> & {
    inputClassName?: string;
    value: string | number;
  }) {
  return (
    <InlineEditableValue
      ariaLabel={ariaLabel}
      className={className}
      disabled={disabled}
      displayClassName={displayClassName}
      displayValue={displayValue ?? defaultDisplayValue(value, emptyText)}
      editing={editing}
      editor={
        <Input
          {...inputProps}
          autoFocus={inputProps.autoFocus ?? true}
          className={cn("h-10", inputClassName)}
          disabled={disabled}
          value={value}
        />
      }
      inline={inline}
      onEdit={onEdit}
    />
  );
}

function AutoResizeTextarea({
  maxRows,
  value,
  ...props
}: ComponentProps<typeof Textarea> & { maxRows?: number }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    if (!maxRows) {
      textarea.style.height = `${textarea.scrollHeight}px`;
      return;
    }

    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
    const paddingHeight =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom);
    const borderHeight =
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);
    const maxHeight = lineHeight * maxRows + paddingHeight + borderHeight;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxRows, value]);

  return <Textarea {...props} ref={ref} value={value} />;
}

export function InlineEditableTextarea({
  ariaLabel,
  className,
  disabled = false,
  displayClassName,
  displayValue,
  editing,
  emptyText = "-",
  inline,
  maxRows,
  onEdit,
  textareaClassName,
  value,
  ...textareaProps
}: InlineEditableCommonProps &
  Omit<ComponentProps<typeof Textarea>, "disabled" | "value"> & {
    maxRows?: number;
    textareaClassName?: string;
    value: string;
  }) {
  return (
    <InlineEditableValue
      ariaLabel={ariaLabel}
      className={className}
      disabled={disabled}
      displayClassName={cn(
        "whitespace-pre-wrap wrap-break-word",
        displayClassName
      )}
      displayValue={displayValue ?? defaultDisplayValue(value, emptyText)}
      editing={editing}
      editor={
        <AutoResizeTextarea
          {...textareaProps}
          autoFocus={textareaProps.autoFocus ?? true}
          className={cn("resize-none", textareaClassName)}
          disabled={disabled}
          maxRows={maxRows}
          value={value}
        />
      }
      inline={inline}
      onEdit={onEdit}
    />
  );
}

export type InlineEditableSelectOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

export function InlineEditableSelect({
  ariaLabel,
  className,
  disabled = false,
  displayClassName,
  displayValue,
  editing,
  emptyText = "-",
  inline,
  onEdit,
  onValueChange,
  options,
  placeholder,
  triggerClassName,
  value,
}: InlineEditableCommonProps & {
  onValueChange: (value: string) => void;
  options: InlineEditableSelectOption[];
  placeholder?: string;
  triggerClassName?: string;
  value: string;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <InlineEditableValue
      alwaysShowEditor
      ariaLabel={ariaLabel}
      className={className}
      disabled={disabled}
      displayClassName={displayClassName}
      displayValue={
        displayValue ?? defaultDisplayValue(selectedLabel, emptyText)
      }
      editing={editing}
      editor={
        <Select
          disabled={disabled}
          onOpenChange={(open) => {
            if (open) onEdit();
          }}
          onValueChange={(nextValue) => {
            if (nextValue !== null) onValueChange(nextValue);
          }}
          value={value}
        >
          <SelectTrigger aria-label={ariaLabel} className={triggerClassName}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent align="start" data-inline-editable-interaction="">
            {options.map((option) => (
              <SelectItem
                disabled={option.disabled}
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      inline={inline}
      onEdit={onEdit}
    />
  );
}
