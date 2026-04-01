"use client";

import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { extractRequestAccessToken } from "@/lib/requestAccess/client";
import type {
  RequestAccessApprovalDraft,
  RequestAccessApprovalEmailLocale,
} from "@/lib/requestAccess/types";
import { isInternalEmail } from "@/lib/internalAccess";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Laptop,
  LoaderCircle,
  RotateCcw,
  Send,
  Smartphone,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PreviewViewport = "desktop" | "mobile";

function DetailRow({
  label,
  multiline = false,
  value,
}: {
  label: string;
  multiline?: boolean;
  value: string;
}) {
  return (
    <div>
      <div className={opsTheme.eyebrow}>{label}</div>
      <div
        className={cx(
          "mt-2 font-geist text-sm text-beige900",
          multiline && "whitespace-pre-wrap leading-6"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function statusLabel(status: RequestAccessApprovalDraft["status"] | undefined) {
  if (status === "already_granted") return "Already activated";
  if (status === "approved") return "Approved";
  if (status === "pending") return "Pending";
  return "-";
}

function localeLabel(locale: RequestAccessApprovalEmailLocale) {
  return locale === "ko" ? "한국어" : "English";
}

function buildEmailPreviewDocument(html: string) {
  const trimmedHtml = html.trim();
  if (!trimmedHtml) {
    return `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin:0;background:#eef2f6;"></body>
      </html>`;
  }

  const hasDocumentTag =
    /<!doctype/i.test(trimmedHtml) || /<html[\s>]/i.test(trimmedHtml);

  if (hasDocumentTag) {
    return trimmedHtml;
  }

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background: #eef2f6;
          }

          img {
            max-width: 100%;
            height: auto;
          }

          table {
            border-collapse: collapse;
          }
        </style>
      </head>
      <body>${trimmedHtml}</body>
    </html>`;
}

function EmailClientPreview({
  from,
  html,
  subject,
  to,
  viewport,
  onViewportChange,
}: {
  from: string;
  html: string;
  subject: string;
  to: string;
  viewport: PreviewViewport;
  onViewportChange: (viewport: PreviewViewport) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => buildEmailPreviewDocument(html), [html]);

  const syncIframeHeight = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentWindow?.document;
    if (!iframe || !doc) return;

    const nextHeight = Math.max(
      doc.body?.scrollHeight ?? 0,
      doc.documentElement?.scrollHeight ?? 0,
      560
    );

    iframe.style.height = `${nextHeight}px`;
  }, []);

  useEffect(() => {
    const timeouts = [
      window.setTimeout(syncIframeHeight, 0),
      window.setTimeout(syncIframeHeight, 120),
      window.setTimeout(syncIframeHeight, 360),
    ];

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [srcDoc, syncIframeHeight, viewport]);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white font-inter">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-neutral-900">
            {subject || "(No subject)"}
          </div>
        </div>

        <div className="ml-4 inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5">
          <button
            type="button"
            onClick={() => onViewportChange("desktop")}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors",
              viewport === "desktop"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            <Laptop className="h-3.5 w-3.5" />
            Desktop
          </button>
          <button
            type="button"
            onClick={() => onViewportChange("mobile")}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors",
              viewport === "mobile"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Mobile
          </button>
        </div>
      </div>

      <div className="border-b border-neutral-200 bg-white px-4 py-4">
        <div className="grid gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
              From
            </div>
            <div className="mt-1 truncate text-neutral-800">
              {from || "(Default sender)"}
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
              To
            </div>
            <div className="mt-1 truncate text-neutral-800">
              {to || "(No recipient)"}
            </div>
          </div>
        </div>
      </div>

      <div className=" p-4">
        <div
          className={cx(
            "mx-auto overflow-hidden bg-white transition-[width] duration-200",
            viewport === "mobile"
              ? "w-[390px] max-w-full"
              : "w-full max-w-[860px]"
          )}
        >
          <iframe
            ref={iframeRef}
            title="Email preview"
            srcDoc={srcDoc}
            sandbox="allow-same-origin"
            onLoad={syncIframeHeight}
            className="block w-full border-0 bg-white"
            style={{ minHeight: "560px" }}
          />
        </div>
      </div>
    </div>
  );
}

export default function OpsRequestAccessReviewPage() {
  const router = useRouter();
  const { session, user } = useAuthStore();
  const isAllowedUser = isInternalEmail(user?.email);

  const [draft, setDraft] = useState<RequestAccessApprovalDraft | null>(null);
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestInput, setRequestInput] = useState("");
  const [previewViewport, setPreviewViewport] =
    useState<PreviewViewport>("desktop");
  const [locale, setLocale] = useState<RequestAccessApprovalEmailLocale>("en");

  const requestToken = useMemo(() => {
    if (!router.isReady) return "";
    const raw = router.query.request;
    return typeof raw === "string" ? raw.trim() : "";
  }, [router.isReady, router.query.request]);

  useEffect(() => {
    if (!requestToken) return;
    setRequestInput(requestToken);
  }, [requestToken]);

  const getAccessToken = useCallback(async () => {
    if (session?.access_token) return session.access_token;
    const {
      data: { session: latestSession },
    } = await supabase.auth.getSession();
    return latestSession?.access_token ?? null;
  }, [session?.access_token]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!user || !isAllowedUser) return;
    if (!requestToken) {
      setDraft(null);
      setError("");
      setNotice("");
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("로그인 세션을 찾지 못했습니다.");
        }

        setIsLoading(true);
        setError("");
        setNotice("");

        const response = await fetch(
          `/api/request-access/review?request=${encodeURIComponent(requestToken)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
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
        setLocale(payload.locale);
        setFrom(payload.from);
        setSubject(payload.subject);
        setHtml(payload.html);
      } catch (requestError) {
        if (!cancelled) {
          setDraft(null);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load email draft."
          );
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
  }, [getAccessToken, isAllowedUser, requestToken, router.isReady, user]);

  const applyLocaleTemplate = useCallback(
    (nextLocale: RequestAccessApprovalEmailLocale) => {
      if (!draft) return;

      const template = draft.templates[nextLocale];
      setLocale(nextLocale);
      setSubject(template.subject);
      setHtml(template.html);
      setError("");
      setNotice(`${localeLabel(nextLocale)} default email applied.`);
    },
    [draft]
  );

  const handleReset = () => {
    if (!draft) return;
    const template = draft.templates[locale];
    setFrom(draft.from);
    setSubject(template.subject);
    setHtml(template.html);
    setError("");
    setNotice(`${localeLabel(locale)} default sender and email restored.`);
  };

  const handleOpenReview = useCallback(() => {
    const token = extractRequestAccessToken(requestInput);
    if (!token) return;

    void router.push({
      pathname: "/ops/request-access/review",
      query: { request: token },
    });
  }, [requestInput, router]);

  const handleSend = async () => {
    if (!draft || isSending) return;

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("로그인 세션을 찾지 못했습니다.");
      }

      setIsSending(true);
      setError("");
      setNotice("");

      const response = await fetch("/api/request-access/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          request: requestToken,
          locale,
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
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send approval email."
      );
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
    <>
      <Head>
        <title>Request Access Review</title>
        <meta
          name="description"
          content="Internal request access review for Harper"
        />
      </Head>

      <OpsShell
        title="Request Access Review"
        description="승인 메일 draft를 확인하고, 필요하면 sender, subject, body를 수정한 뒤 내부에서 바로 발송합니다."
      >
        {!requestToken ? (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className={cx(opsTheme.panel, "p-5")}>
              <div className={opsTheme.eyebrow}>Review Token</div>
              <h2 className={cx(opsTheme.titleSm, "mt-1")}>
                Review Token Required
              </h2>
              <div className="mt-3 font-geist text-sm leading-6 text-beige900/65">
                Slack에서 받은 review 링크 전체를 붙여넣거나 `request` 토큰만
                넣으면 review 화면으로 이동합니다.
              </div>

              <textarea
                value={requestInput}
                onChange={(event) => setRequestInput(event.target.value)}
                className={cx(opsTheme.textarea, "mt-5 min-h-[132px]")}
                placeholder="https://.../ops/request-access/review?request=..."
                spellCheck={false}
              />

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenReview}
                  disabled={!extractRequestAccessToken(requestInput)}
                  className={cx(opsTheme.buttonPrimary, "h-11")}
                >
                  Review 열기
                </button>
                <Link
                  href="/ops/request-access"
                  className={cx(opsTheme.buttonSoft, "h-11")}
                >
                  Request Access 허브로 이동
                </Link>
              </div>
            </div>

            <div className={cx(opsTheme.panel, "p-5")}>
              <div className={opsTheme.eyebrow}>Flow</div>
              <h2 className={cx(opsTheme.titleSm, "mt-1")}>How It Works</h2>
              <div className="mt-3 space-y-3 font-geist text-sm leading-6 text-beige900/70">
                <div className={cx(opsTheme.panelSoft, "px-4 py-3")}>
                  1. review 링크나 request 토큰을 붙여넣습니다.
                </div>
                <div className={cx(opsTheme.panelSoft, "px-4 py-3")}>
                  2. 승인 메일 draft를 확인하고 필요한 부분만 수정합니다.
                </div>
                <div className={cx(opsTheme.panelSoft, "px-4 py-3")}>
                  3. 내부 review 화면에서 바로 승인 메일을 발송합니다.
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className={cx(opsTheme.panel, "p-5")}>
              <div className={opsTheme.eyebrow}>Request Access</div>
              <h2 className={cx(opsTheme.titleSm, "mt-1")}>
                Approval Email Review
              </h2>
              <p className="mt-3 font-geist text-sm leading-6 text-beige900/65">
                신청자 컨텍스트를 보고, HTML 메일을 수정한 뒤 승인 메일을
                보냅니다.
              </p>

              <div className="mt-8 space-y-4 text-sm">
                <DetailRow label="Recipient" value={draft?.email || "-"} />
                <DetailRow label="Name" value={draft?.name || "-"} />
                <DetailRow label="Company" value={draft?.company || "-"} />
                <DetailRow label="Role" value={draft?.role || "-"} />
                <DetailRow
                  label="Hiring Need"
                  multiline
                  value={draft?.hiringNeed || "-"}
                />
                <DetailRow label="Status" value={statusLabel(draft?.status)} />
              </div>

              {draft?.activationUrl ? (
                <div className={cx(opsTheme.panelSoft, "mt-8 px-4 py-4")}>
                  <div className={opsTheme.eyebrow}>Activation URL</div>
                  <p className="mt-3 break-all font-geist text-xs leading-5 text-beige900/65">
                    {draft.activationUrl}
                  </p>
                </div>
              ) : null}
            </aside>

            <main className={cx(opsTheme.panel, "p-5 md:p-6")}>
              {isLoading ? (
                <div className="flex min-h-[420px] items-center justify-center">
                  <LoaderCircle className="h-6 w-6 animate-spin text-beige900/45" />
                </div>
              ) : !draft ? (
                error ? (
                  <div className={opsTheme.errorNotice}>{error}</div>
                ) : null
              ) : (
                <div className="space-y-6">
                  {error ? (
                    <div className={opsTheme.errorNotice}>{error}</div>
                  ) : null}
                  {notice ? (
                    <div className={opsTheme.successNotice}>{notice}</div>
                  ) : null}

                  <div>
                    <label className={opsTheme.label}>Language</label>
                    <div className="mt-2 inline-flex rounded-md border border-beige900/10 bg-white/80 p-1">
                      {(["en", "ko"] as RequestAccessApprovalEmailLocale[]).map(
                        (option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => applyLocaleTemplate(option)}
                            className={cx(
                              "rounded-md px-3 py-2 font-geist text-sm transition",
                              locale === option
                                ? "bg-beige900 text-beige100"
                                : "text-beige900/60 hover:bg-beige500/35 hover:text-beige900"
                            )}
                          >
                            {localeLabel(option)}
                          </button>
                        )
                      )}
                    </div>
                    <p className="mt-2 font-geist text-xs leading-5 text-beige900/50">
                      언어를 바꾸면 기본 제목과 HTML 본문이 해당 버전으로
                      교체됩니다.
                    </p>
                  </div>

                  <div>
                    <label className={opsTheme.label}>From</label>
                    <input
                      type="text"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                      className={cx(opsTheme.input, "mt-2")}
                      placeholder="Harper <team@matchharper.com>"
                    />
                    <p className="mt-2 font-geist text-xs leading-5 text-beige900/50">
                      이 메일 1회에 한해 sender를 덮어씁니다. 실제 발신 주소는
                      메일 provider에서 유효해야 합니다.
                    </p>
                  </div>

                  <div>
                    <label className={opsTheme.label}>Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      className={cx(opsTheme.input, "mt-2")}
                      placeholder={draft.templates[locale].subject}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <label className={opsTheme.label}>HTML Body</label>
                      <button
                        type="button"
                        onClick={handleReset}
                        disabled={!draft || isSending}
                        className={cx(opsTheme.buttonSoft, "h-9 px-3 text-xs")}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset Default
                      </button>
                    </div>
                    <textarea
                      value={html}
                      onChange={(event) => setHtml(event.target.value)}
                      className={cx(
                        opsTheme.textarea,
                        "mt-2 min-h-[320px] resize-y text-[13px]"
                      )}
                      placeholder="<div>...</div>"
                      spellCheck={false}
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={isSendDisabled}
                      className={cx(opsTheme.buttonPrimary, "h-11 px-5")}
                    >
                      {isSending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Send Approval Email
                    </button>
                  </div>

                  <section className={cx(opsTheme.panelSoft, "p-5")}>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <div className={opsTheme.eyebrow}>Email Preview</div>
                        <div className="mt-1 font-geist text-sm leading-6 text-beige900/60">
                          iframe 안에서 실제 메일 본문처럼 렌더링합니다. 페이지
                          스타일 간섭 없이 데스크톱과 모바일 폭을 같이 볼 수
                          있습니다.
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <EmailClientPreview
                        from={from}
                        to={draft.email}
                        subject={subject}
                        html={html}
                        viewport={previewViewport}
                        onViewportChange={setPreviewViewport}
                      />
                    </div>
                  </section>
                </div>
              )}
            </main>
          </div>
        )}
      </OpsShell>
    </>
  );
}
