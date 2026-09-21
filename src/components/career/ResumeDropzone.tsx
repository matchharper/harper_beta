import { FileText, Upload } from "lucide-react";
import React, { useState, type ChangeEvent, type DragEvent } from "react";
import { cn } from "@/lib/cn";
import { MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES } from "@/lib/talentOnboarding/documentUploadLimits";
import { CAREER_PROFILE_SOURCE_CARD_CLASS } from "@/components/career/settings/careerProfileSourceCardStyles";

export type ResumeFileSelectSource = "dialog" | "drop";
export type ResumeFileRejectReason = "file-size" | "file-type";

type ResumeDropzoneProps = {
  accept?: string;
  className?: string;
  description: string;
  disabled?: boolean;
  dragDescription: string;
  dragTitle: string;
  fileName?: string;
  inputId: string;
  maxFileSizeBytes?: number;
  onFileSelect: (file: File | null, source: ResumeFileSelectSource) => void;
  onFileReject?: (
    file: File,
    source: ResumeFileSelectSource,
    reason: ResumeFileRejectReason
  ) => void;
  selectedDescription?: string;
  selectedTitle?: string;
  title: string;
  variant?: "default" | "compact" | "source-card";
};

const hasDraggedFiles = (event: DragEvent<HTMLElement>) =>
  Array.from(event.dataTransfer.types).includes("Files");

const isAcceptedFile = (file: File, accept: string) => {
  const acceptItems = accept
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (acceptItems.length === 0) return true;

  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  return acceptItems.some((item) => {
    if (item.startsWith(".")) return fileName.endsWith(item);
    if (item.endsWith("/*")) return fileType.startsWith(item.slice(0, -1));
    return fileType === item;
  });
};

const ResumeDropzone = ({
  accept = ".pdf,.docx,.txt,.md",
  className,
  description,
  disabled = false,
  dragDescription,
  dragTitle,
  fileName = "",
  inputId,
  maxFileSizeBytes = MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES,
  onFileSelect,
  onFileReject,
  selectedDescription,
  selectedTitle,
  title,
  variant = "default",
}: ResumeDropzoneProps) => {
  const [dragDepth, setDragDepth] = useState(0);
  const isCompact = variant === "compact";
  const isSourceCard = variant === "source-card";
  const isSelected = Boolean(fileName);
  const isDragActive = dragDepth > 0 && !disabled;
  const visualTitle = isDragActive
    ? dragTitle
    : isSelected
      ? selectedTitle || fileName
      : title;
  const visualDescription = isDragActive
    ? dragDescription
    : isSelected
      ? selectedDescription || description
      : description;

  const handleDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    if (disabled || !hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragDepth((current) => current + 1);
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    if (disabled || !hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    if (disabled || !hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragDepth((current) => Math.max(0, current - 1));
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    if (disabled || !hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragDepth(0);

    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) {
      if (!isAcceptedFile(file, accept)) {
        onFileReject?.(file, "drop", "file-type");
        return;
      }
      if (file.size > maxFileSizeBytes) {
        onFileReject?.(file, "drop", "file-size");
        return;
      }

      onFileSelect(file, "drop");
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file && !isAcceptedFile(file, accept)) {
      onFileReject?.(file, "dialog", "file-type");
      event.currentTarget.value = "";
      return;
    }
    if (file && file.size > maxFileSizeBytes) {
      onFileReject?.(file, "dialog", "file-size");
      event.currentTarget.value = "";
      return;
    }

    onFileSelect(file, "dialog");
    event.currentTarget.value = "";
  };

  return (
    <label
      htmlFor={inputId}
      aria-disabled={disabled || undefined}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnd={() => setDragDepth(0)}
      onDrop={handleDrop}
      className={cn(
        isSourceCard
          ? CAREER_PROFILE_SOURCE_CARD_CLASS
          : "group relative flex w-full overflow-hidden rounded-[8px] border text-neutral-primary transition-[border-color,background-color,box-shadow,transform] duration-200",
        isSourceCard
          ? "flex-col items-start justify-between border-dashed p-3 text-left shadow-none"
          : isCompact
            ? "min-h-[112px] items-center px-4 py-4 text-left"
            : "min-h-[158px] flex-col items-center justify-center px-4 py-9 text-center",
        disabled
          ? "cursor-not-allowed border-neutral-1000-a05 bg-bg-weak opacity-70"
          : "cursor-pointer",
        isDragActive
          ? "border-neutral-800 bg-bg-weak shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-neutral-1000)_10%,transparent)]"
          : isSelected
            ? "border-neutral-800 bg-bg-weak hover:bg-bg-weak"
            : "border-dashed border-neutral-400 bg-bg-floating hover:border-neutral-800 hover:bg-bg-weak",
        className
      )}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        className="hidden"
        onChange={handleChange}
      />

      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none flex min-w-0",
          isSourceCard
            ? "h-full w-full flex-col items-start"
            : isCompact
              ? "w-full items-center gap-3"
              : "flex-col items-center justify-center gap-2"
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center border transition-colors",
            isSourceCard ? "h-9 w-9 rounded-[8px]" : "h-11 w-11 rounded-full",
            isDragActive
              ? "border-neutral-800 bg-neutral-1000 text-neutral-00"
              : "border-neutral-1000-a05 bg-bg-weak text-neutral-primary"
          )}
        >
          {isSelected && !isDragActive ? (
            <FileText
              className={isSourceCard ? "h-4 w-4" : "h-5 w-5"}
              strokeWidth={1.6}
            />
          ) : (
            <Upload
              className={isSourceCard ? "h-4 w-4" : "h-5 w-5"}
              strokeWidth={1.6}
            />
          )}
        </span>

        <span className={cn("min-w-0", isSourceCard && "mt-auto w-full")}>
          <span
            className={cn(
              "block max-w-full truncate font-normal",
              isSourceCard
                ? "text-[13px] font-medium leading-[17px]"
                : "text-sm",
              isDragActive ? "text-neutral-primary" : "text-neutral-primary"
            )}
          >
            {visualTitle}
          </span>
          <span
            className={cn(
              "mt-1 block font-normal text-neutral-muted",
              isSourceCard
                ? "line-clamp-2 text-[11px] leading-4"
                : "text-[13px] leading-5",
              isCompact || isSourceCard ? "text-left" : "text-center"
            )}
          >
            {visualDescription}
          </span>
        </span>
      </span>
    </label>
  );
};

export default React.memo(ResumeDropzone);
