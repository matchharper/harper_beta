"use client";

import { useRef, type RefObject } from "react";
import { Check, FileText } from "lucide-react";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { OneScreenCopy } from "@/lib/officialJobs/oneScreenCopy";
import {
  LinkedInMark,
  ONE_SCREEN_INPUT_CLASS,
  OneScreenFieldError,
  OneScreenFieldLabel,
} from "@/components/jobs/OfficialJobOneScreenParts";

/** The same files /career/onboarding takes. */
export const ONE_SCREEN_RESUME_ACCEPT = ".pdf,.docx,.txt,.md";

export function isOneScreenResumeType(file: File) {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return ONE_SCREEN_RESUME_ACCEPT.split(",").includes(`.${extension}`);
}

export type OneScreenMaterialState = {
  linkedinOn: boolean;
  linkedinUrl: string;
  resumeFile: File | null;
};

/**
 * ③ "이력서 또는 LinkedIn": a CV tile that opens the file picker and a
 * LinkedIn tile that shows the URL field. Either one is enough; both are fine.
 */
export default function OfficialJobOneScreenMaterial({
  copy,
  idPrefix,
  label,
  layout,
  state,
  onLinkedinOnChange,
  onLinkedinUrlChange,
  onLinkedinBlur,
  onResumeFile,
  onResumeReject,
  error,
  resumeAgain,
  disabled,
  linkedinInputRef,
}: {
  copy: OneScreenCopy;
  idPrefix: string;
  label: string;
  layout: "card" | "page";
  state: OneScreenMaterialState;
  onLinkedinOnChange: (on: boolean) => void;
  onLinkedinUrlChange: (value: string) => void;
  onLinkedinBlur: () => void;
  onResumeFile: (file: File | null) => void;
  onResumeReject: (reason: "type") => void;
  error?: string | null;
  /** The draft had a CV that did not survive the redirect. */
  resumeAgain: boolean;
  disabled?: boolean;
  linkedinInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labelId = `${idPrefix}-material-label`;
  const errorId = `${idPrefix}-material-error`;
  const linkedinInputId = `${idPrefix}-linkedin`;
  const resumeSelected = Boolean(state.resumeFile);

  const tileClassName = cn(
    "relative flex flex-col items-center justify-center gap-2 px-2 py-3 text-center text-[13px] font-normal disabled:opacity-60",
    layout === "page" ? "h-[104px]" : "h-[84px]"
  );

  return (
    <div role="group" aria-labelledby={labelId}>
      <OneScreenFieldLabel id={labelId}>{label}</OneScreenFieldLabel>
      <div
        className={cn(
          "grid grid-cols-2 gap-2",
          layout === "page" && "max-w-[232px] gap-3"
        )}
      >
        <CardButton
          selected={resumeSelected}
          aria-pressed={resumeSelected}
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className={tileClassName}
        >
          <TileCheck on={resumeSelected} />
          <FileText className="h-5 w-5" aria-hidden="true" />
          <span>{copy.cvTile}</span>
        </CardButton>
        <CardButton
          selected={state.linkedinOn}
          aria-pressed={state.linkedinOn}
          aria-controls={linkedinInputId}
          disabled={disabled}
          onClick={() => onLinkedinOnChange(!state.linkedinOn)}
          className={tileClassName}
        >
          <TileCheck on={state.linkedinOn} />
          <LinkedInMark />
          <span>{copy.linkedinTile}</span>
        </CardButton>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ONE_SCREEN_RESUME_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (!file) return;
          if (!isOneScreenResumeType(file)) {
            onResumeReject("type");
            return;
          }
          onResumeFile(file);
        }}
      />

      {state.resumeFile ? (
        <div className="mt-2 flex items-center gap-2 rounded-sm border border-beige900/10 bg-bg-floating/65 px-3 py-2 text-[13px] text-neutral-primary">
          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{state.resumeFile.name}</span>
          <MuteButton
            variant="transparent"
            size="sm"
            disabled={disabled}
            onClick={() => onResumeFile(null)}
          >
            {copy.removeFile}
          </MuteButton>
        </div>
      ) : resumeAgain ? (
        <p className="mt-2 text-[12px] leading-5 text-neutral-primary/70">
          {copy.resumeAgain}
        </p>
      ) : null}

      {state.linkedinOn ? (
        <div className="mt-3">
          <OneScreenFieldLabel
            htmlFor={linkedinInputId}
            className={layout === "card" ? "sr-only" : undefined}
          >
            {copy.linkedinLabel}
          </OneScreenFieldLabel>
          <Input
            ref={linkedinInputRef}
            id={linkedinInputId}
            type="url"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={copy.linkedinPlaceholder}
            value={state.linkedinUrl}
            disabled={disabled}
            onChange={(event) => onLinkedinUrlChange(event.target.value)}
            onBlur={onLinkedinBlur}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={ONE_SCREEN_INPUT_CLASS}
          />
        </div>
      ) : null}
      <OneScreenFieldError id={errorId} message={error} />
    </div>
  );
}

function TileCheck({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-[4px] border",
        on
          ? "border-neutral-primary bg-neutral-primary text-neutral-00"
          : "border-beige900/15 bg-bg-floating"
      )}
    >
      {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
  );
}
