import { Fragment, memo, useCallback, useMemo, useState } from "react";
import { ChevronDown, Link2, LoaderCircle, Mail, Send } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { renderEmailBodyHtmlWithHarperFooter } from "@/lib/email/harperFooter";
import {
  useOpsCareerMailHistory,
  useSendCareerTalentMail,
} from "@/hooks/useOpsCareer";
import type { CareerTalentDetailResponse } from "@/lib/opsCareerServer";
import {
  compactMailAddress,
  formatKst,
  mailActorLabel,
  mailStatusClass,
  mailStatusLabel,
  mailTypeLabel,
} from "./utils";

const MailHistoryPanel = memo(function MailHistoryPanel({
  userId,
}: {
  userId: string;
}) {
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOpsCareerMailHistory(userId, 10);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const messages = useMemo(
    () => data?.pages.flatMap((page) => page.messages) ?? [],
    [data]
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className={cx(opsTheme.panelSoft, "p-4")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={opsTheme.eyebrow}>Mail History</div>
          <div className="mt-1 font-geist text-xs text-beige900/45">
            시스템 발송, Ops 수동 발송, 유저 답장
          </div>
        </div>
        <Mail className="h-4 w-4 shrink-0 text-beige900/30" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <LoaderCircle className="h-5 w-5 animate-spin text-beige900/30" />
        </div>
      ) : error ? (
        <div className={cx(opsTheme.errorNotice, "mt-4")}>
          {error instanceof Error
            ? error.message
            : "메일 기록을 불러오지 못했습니다."}
        </div>
      ) : messages.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-beige900/15 bg-white/30 px-4 py-6 text-center font-geist text-sm text-beige900/40">
          저장된 메일 기록이 없습니다.
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-md border border-beige900/10 bg-white/55">
            <table className="min-w-[820px] w-full table-fixed border-collapse font-geist text-xs">
              <thead className="bg-beige500/45 text-left text-beige900/45">
                <tr>
                  <th className="w-[150px] px-3 py-2 font-medium">일시</th>
                  <th className="w-[100px] px-3 py-2 font-medium">구분</th>
                  <th className="w-[170px] px-3 py-2 font-medium">발신</th>
                  <th className="w-[170px] px-3 py-2 font-medium">수신</th>
                  <th className="px-3 py-2 font-medium">제목</th>
                  <th className="w-[90px] px-3 py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beige900/10">
                {messages.map((item) => {
                  const isExpanded = expandedIds.has(item.id);
                  return (
                    <Fragment key={item.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleExpanded(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleExpanded(item.id);
                          }
                        }}
                        className="cursor-pointer text-beige900/70 transition hover:bg-white/70"
                      >
                        <td className="px-3 py-2 align-top text-beige900/45">
                          {formatKst(item.occurredAt)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex items-center gap-1.5">
                            <ChevronDown
                              className={cx(
                                "h-3.5 w-3.5 shrink-0 text-beige900/30 transition",
                                isExpanded ? "rotate-0" : "-rotate-90"
                              )}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-beige900/75">
                                {mailActorLabel(item)}
                              </div>
                              <div className="truncate text-[11px] text-beige900/35">
                                {mailTypeLabel(item.mailType)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td
                          className="truncate px-3 py-2 align-top"
                          title={compactMailAddress(item.fromEmail)}
                        >
                          {compactMailAddress(item.fromEmail)}
                        </td>
                        <td
                          className="truncate px-3 py-2 align-top"
                          title={compactMailAddress(item.toEmail)}
                        >
                          {compactMailAddress(item.toEmail)}
                        </td>
                        <td
                          className="truncate px-3 py-2 align-top font-medium text-beige900/80"
                          title={item.subject ?? "(제목 없음)"}
                        >
                          {item.subject?.trim() || "(제목 없음)"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={cx(
                              "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
                              mailStatusClass(item.status)
                            )}
                          >
                            {mailStatusLabel(item.status)}
                          </span>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr>
                          <td colSpan={6} className="bg-white/65 px-3 py-3">
                            <div className="rounded-md border border-beige900/10 bg-white/70 px-3 py-3 font-geist text-xs leading-5 text-beige900/70">
                              {item.bodyText?.trim() ? (
                                <div className="whitespace-pre-wrap">
                                  {item.bodyText.trim()}
                                </div>
                              ) : (
                                <div className="text-beige900/35">
                                  저장된 본문이 없습니다.
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className={cx(opsTheme.buttonSecondary, "h-9 px-4 text-xs")}
              >
                {isFetchingNextPage ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    불러오는 중...
                  </>
                ) : (
                  "10개 더 보기"
                )}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
});

type MailTabProps = {
  detail: CareerTalentDetailResponse;
};

export const MailTab = memo(function MailTab({ detail }: MailTabProps) {
  const sendMail = useSendCareerTalentMail();
  const [fromEmail, setFromEmail] = useState("Harper <hello@matchharper.com>");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [previewDate] = useState(() =>
    new Date().toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  );

  const recipientLabel = detail.name
    ? `${detail.name} <${detail.email ?? "email 없음"}>`
    : (detail.email ?? "email 없음");
  const previewHtml = useMemo(
    () => renderEmailBodyHtmlWithHarperFooter(content),
    [content]
  );
  const canSend =
    Boolean(detail.email?.trim()) &&
    Boolean(fromEmail.trim()) &&
    Boolean(subject.trim()) &&
    Boolean(content.trim()) &&
    !sendMail.isPending;

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const recipient = detail.email?.trim();
    if (!recipient) return;
    if (!window.confirm(`${recipient}에게 메일을 발송할까요?`)) return;

    setNotice("");
    setError("");

    try {
      const result = await sendMail.mutateAsync({
        content: content.trim(),
        fromEmail: fromEmail.trim(),
        subject: subject.trim(),
        userId: detail.userId,
      });
      setNotice(`${result.recipientEmail}로 발송했습니다.`);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "메일 발송에 실패했습니다."
      );
    }
  }, [
    canSend,
    content,
    detail.email,
    detail.userId,
    fromEmail,
    sendMail,
    subject,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={opsTheme.eyebrow}>Recipient</div>
          <div className="mt-1 break-all font-geist text-sm font-medium text-beige900">
            {recipientLabel}
          </div>
        </div>
        <Mail className="h-5 w-5 shrink-0 text-beige900/25" />
      </div>

      {!detail.email?.trim() ? (
        <div className={opsTheme.errorNotice}>
          이 talent에는 등록된 이메일이 없어 발송할 수 없습니다.
        </div>
      ) : null}
      {notice ? <div className={opsTheme.successNotice}>{notice}</div> : null}
      {error ? <div className={opsTheme.errorNotice}>{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <div className="space-y-3">
          <label className="block">
            <span className={opsTheme.label}>From</span>
            <input
              type="text"
              value={fromEmail}
              onChange={(event) => setFromEmail(event.target.value)}
              placeholder="Harper <chris@matchharper.com>"
              className={cx(opsTheme.input, "mt-2")}
            />
          </label>
          <label className="block">
            <span className={opsTheme.label}>Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="메일 제목"
              className={cx(opsTheme.input, "mt-2")}
            />
          </label>
          <label className="block">
            <span className={opsTheme.label}>Body</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={`안녕하세요 ${detail.name ?? "후보자"}님,\n\n\n\n감사합니다.\nHarper 드림`}
              className={cx(opsTheme.textarea, "mt-2 min-h-[260px]")}
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className={cx(opsTheme.buttonPrimary, "h-11 w-full")}
          >
            {sendMail.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            발송
          </button>
        </div>

        <div className="rounded-lg border border-black/10 bg-white shadow-[0_16px_42px_rgba(0,0,0,0.08)]">
          <div className="border-b border-black/10 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-geist text-base font-semibold text-[#202124]">
                  {subject.trim() || "(제목 없음)"}
                </div>
                <div className="mt-1 truncate font-geist text-xs text-[#5f6368]">
                  From: {fromEmail.trim() || "sender@matchharper.com"}
                </div>
                <div className="mt-0.5 truncate font-geist text-xs text-[#5f6368]">
                  To: {recipientLabel}
                </div>
              </div>
              <div className="shrink-0 font-geist text-xs text-[#5f6368]">
                {previewDate}
              </div>
            </div>
          </div>
          <div className="min-h-[300px] px-5 py-5 font-geist text-sm leading-6 text-[#202124]">
            {content.trim() ? (
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <div className="text-[#5f6368]">
                본문을 입력하면 발송될 이메일 형태로 표시됩니다.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={cx(opsTheme.panelSoft, "p-4")}>
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-beige900/35" />
          <div className={opsTheme.eyebrow}>Link Format</div>
        </div>
        <div className="mt-3 space-y-2 font-geist text-xs leading-5 text-beige900/65">
          <div>
            링크는{" "}
            <code className="rounded bg-beige500/60 px-1.5 py-0.5 font-mono text-[11px]">
              [보여줄 문구](https://example.com)
            </code>{" "}
            형식으로 넣으면 됩니다.
          </div>
          <div>
            이메일 링크는{" "}
            <code className="rounded bg-beige500/60 px-1.5 py-0.5 font-mono text-[11px]">
              [Chris에게 문의](mailto:chris@matchharper.com)
            </code>
            처럼 넣으세요.
          </div>
          <div>
            발신자 표시명을 바꾸려면 From에{" "}
            <code className="rounded bg-beige500/60 px-1.5 py-0.5 font-mono text-[11px]">
              Harper &lt;chris@matchharper.com&gt;
            </code>
            처럼 쓰면 됩니다. Resend에서 인증된 도메인의 주소만 실제 발송됩니다.
          </div>
          <div>
            굵게는{" "}
            <code className="rounded bg-beige500/60 px-1.5 py-0.5 font-mono text-[11px]">
              **텍스트**
            </code>
            , 목록은 줄 앞에{" "}
            <code className="rounded bg-beige500/60 px-1.5 py-0.5 font-mono text-[11px]">
              -
            </code>
            를 붙이면 미리보기와 발송 HTML에 반영됩니다.
          </div>
        </div>
      </div>

      <MailHistoryPanel userId={detail.userId} />
    </div>
  );
});
