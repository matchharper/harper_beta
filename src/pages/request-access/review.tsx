"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/router";
import GradientBackground from "@/components/landing/GradientBackground";
import Header from "@/components/landing/Header";

type RequestAccessApprovalDraft = {
  status: "pending" | "approved" | "already_granted";
  email: string;
  name: string | null;
  company: string | null;
  role: string | null;
  hiringNeed: string | null;
  accessGrantedAt: string | null;
  activationUrl: string;
  from: string;
  subject: string;
  html: string;
  text: string;
};

export default function RequestAccessReviewPage() {
  const router = useRouter();
  const interactiveRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<RequestAccessApprovalDraft | null>(null);
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestToken = useMemo(() => {
    if (!router.isReady) return "";
    const raw = router.query.request;
    return typeof raw === "string" ? raw.trim() : "";
  }, [router.isReady, router.query.request]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!requestToken) {
      setDraft(null);
      setError("Invalid request link.");
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        setError("");
        setNotice("");

        const response = await fetch(
          `/api/request-access/review?request=${encodeURIComponent(requestToken)}`
        );
        const payload = (await response.json().catch(() => ({}))) as
          | RequestAccessApprovalDraft
          | { error?: string };

        if (cancelled) return;

        if (!response.ok || !("email" in payload)) {
          setDraft(null);
          setError(
            typeof payload === "object" && payload && "error" in payload
              ? String(payload.error || "Failed to load email draft.")
              : "Failed to load email draft."
          );
          return;
        }

        setDraft(payload);
        setFrom(payload.from);
        setSubject(payload.subject);
        setHtml(payload.html);
      } catch {
        if (!cancelled) {
          setDraft(null);
          setError("Failed to load email draft.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestToken, router.isReady]);

  const handleReset = () => {
    if (!draft) return;
    setFrom(draft.from);
    setSubject(draft.subject);
    setHtml(draft.html);
    setNotice("Default sender and approval email restored.");
  };

  const handleSend = async () => {
    if (!draft || isSending) return;

    try {
      setIsSending(true);
      setError("");
      setNotice("");

      const response = await fetch("/api/request-access/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request: requestToken,
          from,
          subject,
          html,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        status?: "approved" | "already_granted";
        email?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error || "Failed to send approval email.");
        return;
      }

      if (payload.status === "already_granted") {
        setDraft((prev) =>
          prev ? { ...prev, status: "already_granted" } : prev
        );
        setNotice(
          payload.email
            ? `${payload.email} has already activated access.`
            : "This request has already been activated."
        );
        return;
      }

      setDraft((prev) => (prev ? { ...prev, status: "approved" } : prev));
      setNotice(
        payload.email
          ? `Approval email sent to ${payload.email}.`
          : "Approval email sent."
      );
    } catch {
      setError("Failed to send approval email.");
    } finally {
      setIsSending(false);
    }
  };

  const isSendDisabled =
    isLoading ||
    isSending ||
    !draft ||
    draft.status === "already_granted" ||
    !subject.trim() ||
    !html.trim();

  return (
    <div className="relative min-h-screen bg-black px-4 pb-12 text-white font-inter">
      <Header page="company" />
      <GradientBackground interactiveRef={interactiveRef} />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-start justify-center pt-24 md:pt-28">
        <div className="grid w-full gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-md">
            <div className="text-xs uppercase tracking-[0.24em] text-white/45">
              Request Access
            </div>
            <h1 className="mt-3 text-3xl font-medium tracking-tight">
              Approval Email Review
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Review the applicant context, edit the HTML email if needed, and
              send the approval email from here.
            </p>

            <div className="mt-8 space-y-4 text-sm">
              <DetailRow label="Recipient" value={draft?.email || "-"} />
              <DetailRow label="Name" value={draft?.name || "-"} />
              <DetailRow label="Company" value={draft?.company || "-"} />
              <DetailRow label="Role" value={draft?.role || "-"} />
              <DetailRow
                label="Hiring Need"
                value={draft?.hiringNeed || "-"}
                multiline
              />
              <DetailRow
                label="Status"
                value={
                  draft?.status === "already_granted"
                    ? "Already activated"
                    : draft?.status === "approved"
                      ? "Approved"
                      : draft?.status === "pending"
                        ? "Pending"
                        : "-"
                }
              />
            </div>

            {draft?.activationUrl ? (
              <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Activation URL
                </div>
                <p className="mt-3 break-all text-xs leading-5 text-white/70">
                  {draft.activationUrl}
                </p>
              </div>
            ) : null}
          </aside>

          <main className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-md md:p-7">
            {isLoading ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <LoaderCircle className="h-6 w-6 animate-spin text-white/70" />
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
                {error}
              </div>
            ) : draft ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-white">
                    From
                  </label>
                  <input
                    type="text"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
                    placeholder="Harper <team@matchharper.com>"
                  />
                  <p className="mt-2 text-xs leading-5 text-white/45">
                    This overrides the default sender for this one email. The
                    address still needs to be valid for your mail provider.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
                    placeholder="Your Harper access is ready"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-white">
                      HTML Body
                    </label>
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={!draft || isSending}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-white/75 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset Default
                    </button>
                  </div>
                  <textarea
                    value={html}
                    onChange={(event) => setHtml(event.target.value)}
                    className="mt-2 min-h-[320px] w-full resize-y rounded-3xl border border-white/10 bg-black/30 px-4 py-4 font-mono text-[13px] leading-6 text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
                    placeholder="<div>...</div>"
                    spellCheck={false}
                  />
                </div>

                {notice ? (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    {notice}
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={isSendDisabled}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send Approval Email
                  </button>
                </div>

                <section className="rounded-[28px] border border-white/10 bg-black/30 p-5">
                  <div className="text-xs uppercase tracking-[0.24em] text-white/45">
                    Preview
                  </div>
                  <div className="mt-4 rounded-3xl bg-white p-6 text-sm text-[#111] shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
                    <div className="mb-4 border-b border-black/10 pb-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-black/45">
                        From
                      </div>
                      <div className="mt-2 text-sm text-black/70">
                        {from || "(Default sender)"}
                      </div>
                    </div>
                    <div className="mb-4 border-b border-black/10 pb-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-black/45">
                        Subject
                      </div>
                      <div className="mt-2 text-base font-medium">
                        {subject || "(No subject)"}
                      </div>
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                </section>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div
        className={`mt-1.5 text-sm text-white/85 ${
          multiline ? "whitespace-pre-wrap leading-6" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
