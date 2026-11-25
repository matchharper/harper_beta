"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { OfficialJobEventMetadata } from "@/lib/officialJobs/events";
import type {
  OfficialJobsOneScreenKind,
  OfficialJobsOneScreenStep,
} from "@/lib/officialJobs/oneScreen";
import { rememberOfficialJobsLanding } from "@/lib/officialJobs/oneScreenClient";
import {
  formatOneScreenMegabytes,
  type OneScreenCopy,
} from "@/lib/officialJobs/oneScreenCopy";
import {
  checkOneScreenLinkedinUrl,
  isOneScreenEmail,
  isOneScreenMaterialReady,
} from "@/lib/officialJobs/oneScreenDraft";
import { OFFICIAL_JOBS_SIMILAR_RESUME_MAX_BYTES } from "@/lib/officialJobs/similarRequest";
import {
  isSimilarResumeTooLarge,
  sendOfficialJobsSimilarRequest,
} from "@/lib/officialJobs/similarRequestClient";
import OfficialJobOneScreenMaterial, {
  type OneScreenMaterialState,
} from "@/components/jobs/OfficialJobOneScreenMaterial";
import {
  ONE_SCREEN_CIRCLED,
  ONE_SCREEN_INPUT_CLASS,
  OneScreenFieldError,
  OneScreenFieldLabel,
  OneScreenProgressBox,
} from "@/components/jobs/OfficialJobOneScreenParts";

type LogStep = (
  step: OfficialJobsOneScreenStep,
  metadata?: OfficialJobEventMetadata
) => void;

/**
 * "비슷한 공고 추천받기": an email and a CV or a LinkedIn URL, then Ashley
 * mails similar postings. The CV is read on the server and not stored; one it
 * cannot read is left out when a LinkedIn URL is there, and the done box says so.
 */
export default function OfficialJobOneScreenSimilar({
  copy,
  idPrefix,
  layout,
  slug,
  kind,
  locale,
  defaultEmail,
  material,
  onMaterialChange,
  log,
  emailInputRef,
}: {
  copy: OneScreenCopy;
  idPrefix: string;
  layout: "card" | "page";
  slug: string;
  kind: OfficialJobsOneScreenKind;
  locale: "ko" | "en";
  defaultEmail: string;
  material: OneScreenMaterialState;
  onMaterialChange: (next: Partial<OneScreenMaterialState>) => void;
  log: LogStep;
  emailInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  /** The address the request went to; set once it is accepted. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  /** The server could not read the CV and went on with the LinkedIn only. */
  const [resumeIgnored, setResumeIgnored] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    material?: string;
    consent?: string;
    form?: string;
  }>({});
  const sendingRef = useRef(false);
  const linkedinRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const email = emailInput ?? defaultEmail;
  const emailId = `${idPrefix}-similar-email`;
  const consentId = `${idPrefix}-similar-consent`;
  const maxLabel = formatOneScreenMegabytes(OFFICIAL_JOBS_SIMILAR_RESUME_MAX_BYTES);

  const linkedinValue = material.linkedinOn ? material.linkedinUrl.trim() : "";
  const linkedinUrl = linkedinValue ? checkOneScreenLinkedinUrl(linkedinValue) : null;

  const materialError = () => {
    if (linkedinValue && !linkedinUrl) return copy.linkedinInvalid;
    if (isSimilarResumeTooLarge(material.resumeFile)) return copy.fileTooLarge(maxLabel);
    if (!linkedinUrl && !material.resumeFile) return copy.materialRequired;
    return undefined;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (sendingRef.current) return;
    const next = {
      email: isOneScreenEmail(email) ? undefined : copy.emailInvalid,
      material: materialError(),
      consent: consent ? undefined : copy.similarConsentRequired,
    };
    setErrors(next);
    if (next.email) {
      emailInputRef?.current?.focus();
      return;
    }
    if (next.material) {
      if (material.linkedinOn) linkedinRef.current?.focus();
      if (next.material === copy.fileTooLarge(maxLabel)) {
        log("similar_error", { code: "FILE_TOO_LARGE" });
      }
      return;
    }
    if (next.consent) {
      consentRef.current?.focus();
      return;
    }

    sendingRef.current = true;
    setSending(true);
    log("similar_submit", {
      linkedin: Boolean(linkedinUrl),
      resume: Boolean(material.resumeFile),
    });
    // As the server keeps it (people.ts cleanEmail): lower case, no mailto:.
    const sentEmail = email.trim().toLowerCase().replace(/^mailto:/, "");
    const result = await sendOfficialJobsSimilarRequest({
      slug,
      kind,
      email: sentEmail,
      linkedinUrl,
      resumeFile: material.resumeFile,
      locale,
      consent,
      lid: rememberOfficialJobsLanding(),
    });
    sendingRef.current = false;
    setSending(false);
    if (result.ok) {
      setResumeIgnored(result.resumeIgnored === true);
      setSentTo(sentEmail);
      return;
    }
    log("similar_error", { code: result.code });
    const message =
      result.code === "FILE_TOO_LARGE"
        ? copy.fileTooLarge(maxLabel)
        : result.error || copy.similarFailed;
    if (
      result.code === "MATERIAL_REQUIRED" ||
      result.code === "LINKEDIN_INVALID" ||
      result.code === "FILE_INVALID" ||
      result.code === "FILE_TOO_LARGE"
    ) {
      setErrors({ material: message });
    } else if (result.code === "EMAIL_INVALID") {
      setErrors({ email: message });
    } else if (result.code === "CONSENT_REQUIRED") {
      setErrors({ consent: message });
    } else {
      setErrors({ form: message });
    }
  };

  if (sentTo) {
    return (
      <div>
        <div
          role="status"
          className="flex items-start gap-3 rounded-sm border border-beige900/10 bg-bg-floating/65 p-4 text-[14px] leading-6 text-neutral-primary"
        >
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="break-keep">{copy.similarDone}</p>
            {resumeIgnored ? (
              <p className="mt-1 break-keep text-[13px]">{copy.similarResumeIgnored}</p>
            ) : null}
            <p className="mt-1 break-all text-[13px] text-neutral-primary/60">
              {copy.similarSentTo(sentTo)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ① needs only a well-formed address (no code: decided 11/25), ② what the server can read.
  const progressRows = copy.similarProgressRows.map((label, index) => ({
    label,
    done:
      index === 0
        ? isOneScreenEmail(email)
        : isOneScreenMaterialReady(material) && !isSimilarResumeTooLarge(material.resumeFile),
  }));

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)}>
      <OneScreenProgressBox
        id={`${idPrefix}-similar-progress`}
        layout={layout}
        title={copy.similarProgress}
        rows={progressRows}
      />

      <div className={layout === "page" ? "mt-7" : "mt-6"}>
        <OneScreenFieldLabel htmlFor={emailId}>
          {ONE_SCREEN_CIRCLED[0]} {copy.emailLabel}
        </OneScreenFieldLabel>
        <Input
          ref={emailInputRef}
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={copy.emailPlaceholder}
          value={email}
          disabled={sending}
          onChange={(event) => {
            setEmailInput(event.target.value);
            setErrors((current) => ({ ...current, email: undefined, form: undefined }));
          }}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={`${emailId}-error`}
          className={ONE_SCREEN_INPUT_CLASS}
        />
        <OneScreenFieldError id={`${emailId}-error`} message={errors.email} />
      </div>

      <div className="mt-6">
        <OfficialJobOneScreenMaterial
          copy={copy}
          idPrefix={`${idPrefix}-similar`}
          label={`${ONE_SCREEN_CIRCLED[1]} ${copy.similarMaterialLabel}`}
          layout={layout}
          state={material}
          disabled={sending}
          linkedinInputRef={linkedinRef}
          onLinkedinOnChange={(on) => {
            onMaterialChange({ linkedinOn: on });
            setErrors((current) => ({ ...current, material: undefined }));
          }}
          onLinkedinUrlChange={(value) => {
            onMaterialChange({ linkedinUrl: value });
            setErrors((current) => ({ ...current, material: undefined }));
          }}
          onLinkedinBlur={() => {
            if (linkedinValue && !linkedinUrl) {
              setErrors((current) => ({ ...current, material: copy.linkedinInvalid }));
            }
          }}
          onResumeFile={(file) => {
            onMaterialChange({ resumeFile: file });
            setErrors((current) => ({
              ...current,
              material: isSimilarResumeTooLarge(file) ? copy.fileTooLarge(maxLabel) : undefined,
            }));
          }}
          onResumeReject={() =>
            setErrors((current) => ({ ...current, material: copy.fileType }))
          }
          error={errors.material}
          resumeAgain={false}
        />
      </div>

      <div className="mt-6">
        <label className="flex cursor-pointer items-start gap-2.5">
          <Checkbox
            ref={consentRef}
            id={consentId}
            size="medium"
            checked={consent}
            disabled={sending}
            onChange={(event) => {
              setConsent(event.target.checked);
              setErrors((current) => ({ ...current, consent: undefined }));
            }}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={`${consentId}-error`}
            className="mt-0.5"
          />
          <span className="break-keep text-[13px] leading-5 text-neutral-primary">
            {copy.similarConsent}
          </span>
        </label>
        <OneScreenFieldError id={`${consentId}-error`} message={errors.consent} />
        <p className="mt-2 break-keep text-[12px] leading-5 text-neutral-primary/55">
          {copy.similarNote}
        </p>
      </div>

      <MuteButton
        type="submit"
        variant="dark"
        size="lg"
        className="mt-6 w-full"
        disabled={sending}
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        <span>{sending ? copy.similarSending : copy.similarSubmit}</span>
      </MuteButton>
      <OneScreenFieldError id={`${idPrefix}-similar-form-error`} message={errors.form} />
    </form>
  );
}
