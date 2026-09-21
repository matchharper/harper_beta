import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MuteButton } from "@/components/ui/button";
import { gtmRequest } from "@/lib/gtm/client";
import { displayValue } from "@/lib/gtm/grid";
import type { GtmRecordDetail, GtmRow, GtmSource } from "@/lib/gtm/types";
import RecordField from "./RecordField";
import EmailBody from "./EmailBody";
import { mailStatusLabels } from "@/lib/gtm/email";
import styles from "./GtmWorkspace.module.css";
export default function OutreachReviewDialog({
  account,
  source,
  initialRow,
  canWrite,
  onClose,
  onSaved,
  onBack,
}: {
  account: string;
  source: GtmSource;
  initialRow: GtmRow;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
  onBack?: () => void;
}) {
  const queryClient = useQueryClient();
  const detailKey = [
    "ops-gtm",
    account,
    "record",
    source.id,
    initialRow.id,
  ] as const;
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) =>
      gtmRequest<GtmRecordDetail>(
        "get_record",
        { source: source.id, record_id: initialRow.id },
        signal
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const row = detail.data?.record;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [autoSaving, setAutoSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [openedAt] = useState(() => Date.now());
  const savedInPanel = useRef(false);
  const retry = useRef<{
    body: string;
    id: string;
    immediateAt: string;
  } | null>(null);
  const reviewRef = useRef<
    (decision: string, automatic?: boolean) => Promise<boolean>
  >(async () => false);
  const dirty = Object.entries(draft).some(
    ([key, value]) => value !== displayValue(row?.[key])
  );
  const finishClose = () => {
    if (savedInPanel.current) {
      savedInPanel.current = false;
      onSaved();
    }
    onClose();
  };
  const close = () => {
    if (pending || autoSaving) return;
    if (dirty && editable) {
      void reviewRef.current("revise", true).then((saved) => {
        if (saved) finishClose();
        else setDiscard(true);
      });
      return;
    }
    if (dirty) setDiscard(true);
    else finishClose();
  };
  const editable =
    canWrite &&
    Boolean(row) &&
    [
      "draft",
      "ready_for_review",
      "needs_revision",
      "approved",
      "failed",
    ].includes(String(row?.status));
  const contentEditable = editable && Number(row?.attempt_count ?? 0) === 0;
  async function review(decision: string, automatic = false) {
    if (!row) return false;
    const data = {
      source: source.id,
      record_id: row.id,
      expected_version: row.row_version,
      decision,
      subject: draft.subject ?? row.subject,
      body: draft.body ?? row.body,
      scheduled_at: draft.scheduled_at ?? row.scheduled_at,
      review_note: draft.review_note ?? row.review_note ?? "",
    };
    if (
      decision !== "skip" &&
      (!String(data.subject ?? "").trim() || !String(data.body ?? "").trim())
    ) {
      setError("제목과 본문을 입력하세요.");
      return false;
    }
    const submittedDraft = { ...draft };
    const body = JSON.stringify(data);
    if (retry.current?.body !== body)
      retry.current = {
        body,
        id: crypto.randomUUID(),
        immediateAt: new Date().toISOString(),
      };
    const payload =
      decision === "approve" && !data.scheduled_at
        ? { ...data, scheduled_at: retry.current.immediateAt }
        : data;
    if (automatic) setAutoSaving(true);
    else setPending(true);
    setError("");
    setConflict(false);
    try {
      const result = await gtmRequest<GtmRow & { delivery_error?: string }>(
        "review_outreach",
        {
          ...payload,
          request_id: retry.current.id,
        }
      );
      queryClient.setQueryData<GtmRecordDetail>(detailKey, (current) =>
        current
          ? { ...current, record: { ...current.record, ...result } }
          : current
      );
      retry.current = null;
      if (automatic) {
        savedInPanel.current = true;
        setDraft((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([key, value]) => submittedDraft[key] !== value
            )
          )
        );
        setNotice("");
      } else {
        setDraft({});
        onSaved();
      }
      const completedAt = new Date().getTime();
      if (result.delivery_error) setError(result.delivery_error);
      else if (!automatic)
        setNotice(
          decision === "approve"
            ? result.status === "sent" || result.status === "replied"
              ? "메일을 발송했습니다."
              : result.status === "sending"
                ? "메일을 발송하고 있습니다."
                : new Date(String(result.scheduled_at)).getTime() > completedAt
                  ? "발송을 예약했습니다."
                  : "발송 대기 중입니다. 최신 상태를 확인하세요."
            : "변경사항을 반영했습니다."
        );
      return true;
    } catch (cause) {
      setConflict(
        cause instanceof Error && "status" in cause && cause.status === 409
      );
      setError(
        cause instanceof Error
          ? cause.message
          : "검토 결과를 저장하지 못했습니다."
      );
      return false;
    } finally {
      if (automatic) setAutoSaving(false);
      else setPending(false);
    }
  }
  useEffect(() => {
    reviewRef.current = review;
  });
  useEffect(() => {
    if (!row || !editable || !dirty || pending || autoSaving || conflict)
      return;
    const timer = setTimeout(
      () => void reviewRef.current("revise", true),
      1000
    );
    return () => clearTimeout(timer);
  }, [autoSaving, conflict, dirty, draft, editable, pending, row]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className={`${styles.dialog} ${styles.recordDialog} ${styles.sidePanel}`}
        overlayClassName="bg-black/15 backdrop-blur-none"
        aria-describedby={undefined}
        onInteractOutside={(event) => {
          if (pending || autoSaving || dirty) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (pending || autoSaving) event.preventDefault();
        }}
      >
        <DialogTitle>
          발송본 검토 · #{displayValue(row?.ref ?? initialRow.ref)}
        </DialogTitle>
        {notice && (
          <div
            role="status"
            className="bg-action/20 text-sm text-black p-2 rounded-md"
          >
            {notice}
          </div>
        )}
        {(error || detail.error) && (
          <div className={styles.error} role="alert">
            {error || detail.error?.message}
          </div>
        )}
        {conflict && (
          <MuteButton
            disabled={pending || autoSaving || detail.isFetching}
            onClick={async () => {
              const latest = await detail.refetch();
              if (latest.data && !latest.error) {
                retry.current = null;
                setConflict(false);
                setComparing(true);
                setError("");
              }
            }}
          >
            초안을 유지하고 최신 발송본 비교
          </MuteButton>
        )}
        {comparing && row && (
          <details open>
            <summary>최신 저장 원문 · 상태 {displayValue(row.status)}</summary>
            <div className={styles.currentValue}>
              {displayValue(row.subject)}
              {"\n\n"}
              {displayValue(row.body)}
            </div>
          </details>
        )}
        {row ? (
          <div className={`${styles.form} ${styles.reviewFields}`}>
            <div className={styles.detailGrid} style={{ maxHeight: "none" }}>
              <label>
                수신자
                <input readOnly value={displayValue(row.recipient_email)} />
              </label>
              <label>
                발신자
                <input readOnly value={displayValue(row.sender_email)} />
              </label>
            </div>
            <div>
              상태:{" "}
              {mailStatusLabels[String(row.status)] ?? displayValue(row.status)}
              {row.scheduled_at
                ? ` · 예약: ${displayValue(row.scheduled_at)}`
                : ""}
            </div>
            <div className={styles.recordBody}>
              <div className={styles.form}>
                <RecordField
                  field={{ key: "subject", label: "최종 제목", required: true }}
                  value={draft.subject ?? displayValue(row.subject)}
                  disabled={pending}
                  readOnly={!contentEditable}
                  onChange={(value) => {
                    setNotice("");
                    setDraft((current) => ({ ...current, subject: value }));
                  }}
                />
                <div
                  className={styles.row}
                  style={{ justifyContent: "space-between" }}
                >
                  <span>최종 본문</span>
                  {contentEditable && (
                    <MuteButton onClick={() => setPreview(!preview)}>
                      {preview ? "편집" : "메일 미리보기"}
                    </MuteButton>
                  )}
                </div>
                <EmailBody
                  label="최종 본문"
                  value={draft.body ?? displayValue(row.body)}
                  disabled={pending}
                  readOnly={!contentEditable || preview}
                  onChange={(value) => {
                    setNotice("");
                    setDraft((current) => ({ ...current, body: value }));
                  }}
                />
                <RecordField
                  field={{
                    key: "scheduled_at",
                    label: "발송 시각 · 비우면 즉시",
                    type: "date",
                  }}
                  value={draft.scheduled_at ?? displayValue(row.scheduled_at)}
                  disabled={pending}
                  readOnly={!editable}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      scheduled_at: value,
                    }))
                  }
                />
                <RecordField
                  field={{ key: "review_note", label: "검토 메모" }}
                  value={draft.review_note ?? displayValue(row.review_note)}
                  disabled={pending}
                  readOnly={!editable}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      review_note: value,
                    }))
                  }
                />
                <details>
                  <summary>준비 근거와 발송 결과</summary>
                  <dl className={styles.facts}>
                    {[
                      "outreach_template_name",
                      "template_version",
                      "selection_reason",
                      "personalization_evidence",
                      "estimated_views",
                      "estimated_cost",
                      "approved_by",
                      "approved_at",
                      "last_error",
                      "sent_at",
                    ]
                      .filter((key) => row[key] != null && row[key] !== "")
                      .map((key) => (
                        <div key={key}>
                          <dt>
                            {source.fields.find((field) => field.key === key)
                              ?.label ?? key}
                          </dt>
                          <dd>{displayValue(row[key])}</dd>
                        </div>
                      ))}
                  </dl>
                </details>
              </div>
            </div>
            <div className={styles.row} style={{ flexWrap: "wrap" }}>
              {[
                ["request_revision", "수정 요청"],
                ["skip", "발송 제외"],
                [
                  "approve",
                  (draft.scheduled_at ?? row.scheduled_at) &&
                  new Date(
                    String(draft.scheduled_at ?? row.scheduled_at)
                  ).getTime() > openedAt
                    ? "예약"
                    : "발송",
                ],
              ].map(([decision, label]) => (
                <MuteButton
                  key={decision}
                  disabled={pending || autoSaving || !editable}
                  variant={decision === "approve" ? "dark" : "default"}
                  onClick={() => void review(decision)}
                >
                  {label}
                </MuteButton>
              ))}
            </div>
            {/* {editable && (
              <div>
                변경사항은 자동 저장됩니다. 발송을 누르면 위 수신자에게 이
                제목·본문을 보냅니다.
              </div>
            )} */}
            {editable && !contentEditable && (
              <div>
                이미 발송을 시도한 메일입니다. 내용 변경은 새 메일로 작성하세요.
              </div>
            )}
          </div>
        ) : (
          <div>
            {detail.isFetching
              ? "발송본 불러오는 중…"
              : "발송본을 불러오지 못했습니다."}
            <MuteButton
              disabled={detail.isFetching}
              onClick={() => void detail.refetch()}
            >
              다시 불러오기
            </MuteButton>
          </div>
        )}
        {discard && (
          <div className={styles.error}>
            저장하지 않은 변경이 있습니다.
            <div className={styles.row}>
              <MuteButton onClick={() => setDiscard(false)}>
                계속 검토
              </MuteButton>
              <MuteButton variant="warn" onClick={finishClose}>
                변경을 버리고 닫기
              </MuteButton>
            </div>
          </div>
        )}
        <div className={styles.row} style={{ justifyContent: "space-between" }}>
          {onBack ? (
            <MuteButton
              disabled={pending || autoSaving || dirty}
              onClick={onBack}
            >
              이전 기록
            </MuteButton>
          ) : (
            <span />
          )}
          <MuteButton disabled={pending || autoSaving} onClick={close}>
            닫기
          </MuteButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
