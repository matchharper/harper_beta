"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  CircleCheck,
  EllipsisVertical,
  ExternalLink,
  Loader2,
  Mail,
} from "lucide-react";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OfficialJobEventMetadata } from "@/lib/officialJobs/events";
import type {
  OfficialJobsOneScreenKind,
  OfficialJobsOneScreenStep,
} from "@/lib/officialJobs/oneScreen";
import {
  requestOneScreenCode,
  verifyOneScreenCode,
  type OneScreenLocale,
} from "@/lib/officialJobs/oneScreenClient";
import type { OneScreenCopy } from "@/lib/officialJobs/oneScreenCopy";
import {
  isOneScreenEmail,
  oneScreenReturnPath,
  type OneScreenAccountSlot,
} from "@/lib/officialJobs/oneScreenDraft";
import {
  GoogleMark,
  ONE_SCREEN_INPUT_CLASS,
  OneScreenFieldError,
  OneScreenFieldLabel,
  OneScreenOrDivider,
} from "@/components/jobs/OfficialJobOneScreenParts";

const RESEND_AFTER_MS = 60_000;

type LogStep = (
  step: OfficialJobsOneScreenStep,
  metadata?: OfficialJobEventMetadata
) => void;

const OTP_MAX_DIGITS = 10;

/** The email-code path of ① 계정: send a 6-digit code, then confirm it (signs the person in). */
export function useOneScreenEmailCode(args: {
  slug: string;
  kind: OfficialJobsOneScreenKind;
  locale: OneScreenLocale;
  copy: OneScreenCopy;
  log: LogStep;
  /** The email and code fields, focused when the step changes. */
  emailRef: RefObject<HTMLInputElement | null>;
  codeRef: RefObject<HTMLInputElement | null>;
}) {
  const { slug, kind, locale, copy, log, emailRef, codeRef } = args;
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);

  const resendInSeconds = sentTo
    ? Math.max(0, Math.ceil((sentAt + RESEND_AFTER_MS - now) / 1000))
    : 0;
  const waiting = resendInSeconds > 0;

  // The code field exists only once sentTo renders: focus it after that commit (a timeout ran before it).
  const codeFocusPending = useRef(false);
  useEffect(() => {
    if (!codeFocusPending.current || !sentTo) return;
    codeFocusPending.current = false;
    codeRef.current?.focus();
  }, [codeRef, sentAt, sentTo]);

  useEffect(() => {
    if (!sentTo || !waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sentTo, waiting]);

  const send = useCallback(async () => {
    const value = email.trim();
    if (sending) return false;
    if (!isOneScreenEmail(value)) {
      setError(copy.emailInvalid);
      emailRef.current?.focus();
      return false;
    }
    setSending(true);
    setError("");
    setNotice("");
    const moveToCode = () => {
      const at = Date.now();
      setSentTo(value);
      setCode("");
      setSentAt(at);
      setNow(at);
      codeFocusPending.current = true;
    };
    try {
      const result = await requestOneScreenCode({
        email: value,
        slug,
        kind,
        locale,
        nextPath: oneScreenReturnPath(window.location.href),
      });
      if (result.ok) {
        log("email_code_sent");
        moveToCode();
        return true;
      }
      log("email_code_error", { stage: "send", code: result.code });
      if (result.code === "EMAIL_RATE_LIMIT") {
        // A code went out a moment ago: let them type that one.
        moveToCode();
        setNotice(result.error);
        return true;
      }
      setError(result.error || copy.codeSendFailed);
      return false;
    } catch {
      log("email_code_error", { stage: "send", code: "NETWORK" });
      setError(copy.codeSendFailed);
      return false;
    } finally {
      setSending(false);
    }
  }, [copy, email, emailRef, kind, locale, log, sending, slug]);

  const verify = useCallback(
    async (onVerified?: () => void) => {
      if (!sentTo || verifying) return;
      const value = code.replace(/\D/g, "");
      // Supabase's code is 6 digits by default; its project setting allows up to 10.
      if (value.length < 6 || value.length > OTP_MAX_DIGITS) {
        setError(copy.codeRequired);
        codeRef.current?.focus();
        return;
      }
      setVerifying(true);
      setError("");
      try {
        const result = await verifyOneScreenCode({
          email: sentTo,
          code: value,
          locale,
        });
        if (result.ok) {
          log("email_verified");
          setNotice("");
          onVerified?.();
          return;
        }
        log("email_code_error", { stage: "verify" });
        setError(copy.codeInvalid);
      } catch {
        log("email_code_error", { stage: "verify", code: "NETWORK" });
        setError(copy.codeInvalid);
      } finally {
        setVerifying(false);
      }
    },
    [code, codeRef, copy, locale, log, sentTo, verifying]
  );

  const switchEmail = useCallback(() => {
    setSentTo(null);
    setCode("");
    setError("");
    setNotice("");
    window.setTimeout(() => emailRef.current?.focus(), 0);
  }, [emailRef]);

  return {
    email,
    setEmail: (value: string) => {
      setEmail(value);
      setError("");
    },
    sentTo,
    code,
    setCode: (value: string) => {
      setCode(value.replace(/\D/g, "").slice(0, OTP_MAX_DIGITS));
      setError("");
    },
    sending,
    verifying,
    error,
    setError,
    notice,
    resendInSeconds,
    send,
    verify,
    switchEmail,
  };
}

export type OneScreenEmailCode = ReturnType<typeof useOneScreenEmailCode>;

export type OneScreenSignedIn = { email: string; google: boolean } | null;

/**
 * ① 계정 by browser: Google here (google), Safari from iPhone LinkedIn
 * (safari), LinkedIn's ⋮ menu on Android (android_menu), or open a browser
 * from another in-app browser (in_app). The email code works in all of them.
 */
export default function OfficialJobOneScreenAccount({
  copy,
  locale,
  idPrefix,
  slot,
  authLoading,
  signedIn,
  googlePending,
  disabled,
  onGoogle,
  onSafari,
  onOpenInBrowser,
  onCopyLink,
  safariStayed,
  linkStatus,
  emailCode,
  emailInputRef,
  codeInputRef,
  onVerified,
  error,
}: {
  copy: OneScreenCopy;
  locale: OneScreenLocale;
  idPrefix: string;
  slot: OneScreenAccountSlot | null;
  authLoading: boolean;
  signedIn: OneScreenSignedIn;
  googlePending: boolean;
  disabled?: boolean;
  onGoogle: () => void;
  onSafari: () => void;
  onOpenInBrowser: () => void;
  onCopyLink: () => void;
  safariStayed: boolean;
  linkStatus: string;
  emailCode: OneScreenEmailCode;
  emailInputRef: RefObject<HTMLInputElement | null>;
  codeInputRef: RefObject<HTMLInputElement | null>;
  onVerified: () => void;
  error?: string | null;
}) {
  const labelId = `${idPrefix}-account-label`;
  const errorId = `${idPrefix}-account-error`;
  const emailId = `${idPrefix}-email`;
  const codeId = `${idPrefix}-code`;
  const shownError = emailCode.error || error;

  const copyLinkLine = (prefix: string, suffix?: string) => (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[12px] leading-5 text-neutral-primary/60">
        <span>{prefix}</span>
        <BareButton
          type="button"
          onClick={onCopyLink}
          className="text-[12px] font-medium text-neutral-primary underline underline-offset-4"
        >
          {copy.copyLink}
        </BareButton>
        {suffix ? <span>{suffix}</span> : null}
      </div>
      <p role="status" aria-live="polite" className="text-[11px] leading-5 text-neutral-primary/60">
        {linkStatus}
      </p>
    </>
  );

  let slotBody: ReactNode;
  if (slot === "safari") {
    slotBody = (
      <div>
        <MuteButton
          size="lg"
          className="w-full"
          disabled={disabled}
          onClick={onSafari}
        >
          <GoogleMark />
          <span>{copy.googleInSafari}</span>
        </MuteButton>
        {safariStayed ? copyLinkLine(copy.safariMissingHelp) : null}
      </div>
    );
  } else if (slot === "android_menu") {
    slotBody = (
      <div className="rounded-md border border-beige900/10 bg-bg-floating/65 px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <GoogleMark />
          <p className="text-[14px] font-medium leading-5 text-neutral-primary">
            {copy.googleInBrowserTitle}
          </p>
        </div>
        <ol className="mt-2 space-y-1 text-[13px] leading-5 text-neutral-primary">
          <li className="flex flex-wrap items-center gap-x-1">
            <span>1.</span>
            <span>{copy.androidMenuStepBefore}</span>
            <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">⋮</span>
            <span>{copy.androidMenuStepAfter}</span>
          </li>
          <li>2. {copy.androidOpenInBrowserStep}</li>
          {/* LinkedIn's menu reopens the post's own link, the job page. */}
          <li>3. {copy.androidContinueStep}</li>
        </ol>
        {copyLinkLine(copy.androidFallbackBefore, copy.androidFallbackAfter)}
      </div>
    );
  } else if (slot === "in_app") {
    slotBody = (
      <div className="rounded-md border border-beige900/10 bg-bg-floating/65 px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <GoogleMark />
          <p className="text-[14px] font-medium leading-5 text-neutral-primary">
            {copy.googleInBrowserTitle}
          </p>
        </div>
        <MuteButton
          size="lg"
          className="mt-3 w-full"
          disabled={disabled}
          onClick={onOpenInBrowser}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span>{copy.openInBrowser}</span>
        </MuteButton>
        {copyLinkLine(copy.androidFallbackBefore)}
      </div>
    );
  } else {
    slotBody = (
      <MuteButton
        size="lg"
        className="w-full"
        disabled={disabled || googlePending}
        onClick={onGoogle}
      >
        {googlePending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleMark />
        )}
        <span>{googlePending ? copy.googlePending : copy.google}</span>
      </MuteButton>
    );
  }

  return (
    <div role="group" aria-labelledby={labelId}>
      <OneScreenFieldLabel id={labelId}>① {copy.accountLabel}</OneScreenFieldLabel>
      {authLoading ? (
        <div className="h-11 animate-pulse rounded-control bg-beige900/5" aria-hidden="true" />
      ) : signedIn ? (
        <div className="flex h-11 items-center gap-3 rounded-control border border-beige900/10 bg-bg-floating/65 px-3 text-[14px] text-neutral-primary">
          {signedIn.google ? (
            <GoogleMark />
          ) : (
            <Mail className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="sr-only">{copy.signedInAs}</span>
          <span className="min-w-0 flex-1 truncate">{signedIn.email}</span>
          <CircleCheck
            className="h-5 w-5 shrink-0 fill-neutral-primary text-neutral-00"
            aria-hidden="true"
          />
        </div>
      ) : (
        <>
          {slotBody}
          <OneScreenOrDivider label={copy.divider} className="my-3" />
          {emailCode.sentTo ? (
            <div>
              <p className="mb-2 text-[13px] leading-5 text-neutral-primary/70">
                {copy.codeSentTo(emailCode.sentTo)}
              </p>
              <label htmlFor={codeId} className="sr-only">
                {copy.codeLabel}
              </label>
              <div className="flex gap-2">
                <Input
                  ref={codeInputRef}
                  id={codeId}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={OTP_MAX_DIGITS}
                  placeholder={copy.codeLabel}
                  value={emailCode.code}
                  disabled={disabled || emailCode.verifying}
                  onChange={(event) => emailCode.setCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    void emailCode.verify(onVerified);
                  }}
                  aria-invalid={shownError ? true : undefined}
                  aria-describedby={errorId}
                  className={`${ONE_SCREEN_INPUT_CLASS} min-w-0 flex-1 tracking-[0.2em]`}
                />
                <MuteButton
                  size="lg"
                  className="shrink-0"
                  disabled={disabled || emailCode.verifying}
                  onClick={() => void emailCode.verify(onVerified)}
                >
                  {emailCode.verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  <span>{emailCode.verifying ? copy.verifying : copy.verify}</span>
                </MuteButton>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] leading-5">
                <BareButton
                  type="button"
                  disabled={disabled || emailCode.sending || emailCode.resendInSeconds > 0}
                  onClick={() => void emailCode.send()}
                  className="font-medium text-neutral-primary underline underline-offset-4 disabled:cursor-default disabled:text-neutral-primary/45 disabled:no-underline"
                >
                  {emailCode.resendInSeconds > 0
                    ? copy.resendIn(emailCode.resendInSeconds)
                    : copy.resend}
                </BareButton>
                <BareButton
                  type="button"
                  disabled={disabled || emailCode.verifying}
                  onClick={emailCode.switchEmail}
                  className="font-medium text-neutral-primary/70 underline underline-offset-4"
                >
                  {copy.otherEmail}
                </BareButton>
              </div>
              {emailCode.notice ? (
                <p role="status" className="mt-1 text-[12px] leading-5 text-neutral-primary/70">
                  {emailCode.notice}
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <label htmlFor={emailId} className="sr-only">
                {copy.emailLabel}
              </label>
              <div className="flex gap-2">
                <Input
                  ref={emailInputRef}
                  id={emailId}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={copy.emailPlaceholder}
                  value={emailCode.email}
                  disabled={disabled || emailCode.sending}
                  onChange={(event) => emailCode.setEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    void emailCode.send();
                  }}
                  aria-invalid={shownError ? true : undefined}
                  aria-describedby={errorId}
                  className={`${ONE_SCREEN_INPUT_CLASS} min-w-0 flex-1`}
                />
                <MuteButton
                  size="lg"
                  className="shrink-0"
                  disabled={disabled || emailCode.sending}
                  onClick={() => void emailCode.send()}
                >
                  {emailCode.sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  <span>{emailCode.sending ? copy.sendingCode : copy.sendCode}</span>
                </MuteButton>
              </div>
            </div>
          )}
        </>
      )}
      <OneScreenFieldError id={errorId} message={signedIn ? null : shownError} />
      {!signedIn ? (
        <p className="mt-3 break-keep text-[12px] leading-5 text-neutral-primary/55">
          {copy.privacyNoticePrefix}
          <Link
            href={`/privacy?lang=${locale}`}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-primary underline underline-offset-2"
          >
            {copy.privacyPolicyLabel}
          </Link>
          {copy.privacyNoticeSuffix}
        </p>
      ) : null}
    </div>
  );
}

