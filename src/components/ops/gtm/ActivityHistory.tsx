import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MuteButton } from "@/components/ui/button";
import { gtmRequest } from "@/lib/gtm/client";
import { displayValue } from "@/lib/gtm/grid";
import type { GtmQueryResult } from "@/lib/gtm/types";
import styles from "./GtmWorkspace.module.css";
const activityLabels: Record<string, string> = {
  note: "메모",
  performance_review: "성과 검토",
  review_adopted: "방향 채택",
  message_draft: "연락 초안",
  message_sent: "발송 완료",
  message_received: "회신 도착",
  message_approved: "발송 승인",
  message_revision_requested: "수정 요청",
  message_skipped: "발송 제외",
  delivery_failed: "전송 실패",
};
export default function ActivityHistory({
  account,
  source,
  recordId,
  canWrite,
  pending,
  onSave,
  onDirtyChange,
}: {
  account: string;
  source: string;
  recordId: string;
  canWrite: boolean;
  pending: boolean;
  onSave: (
    body: string,
    evidence: string,
    kind: string,
    direction: string
  ) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [body, setBody] = useState(""),
    [evidence, setEvidence] = useState(""),
    [offset, setOffset] = useState(0);
  const [kind, setKind] = useState("note"),
    [direction, setDirection] = useState("");
  useEffect(() => {
    onDirtyChange(Boolean(body || evidence || direction));
    return () => onDirtyChange(false);
  }, [body, evidence, direction, onDirtyChange]);
  const history = useQuery({
    queryKey: ["ops-gtm", account, "history", source, recordId, offset],
    queryFn: ({ signal }) =>
      gtmRequest<GtmQueryResult>(
        "activity_history",
        { source, record_id: recordId, offset, limit: 30 },
        signal
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <div className={styles.form}>
      {canWrite && (
        <form
          className={styles.form}
          onSubmit={async (event) => {
            event.preventDefault();
            if (await onSave(body, evidence, kind, direction)) {
              setBody("");
              setEvidence("");
              setDirection("");
              setOffset(0);
            }
          }}
        >
          <label>
            기록 종류
            <select
              aria-label="기록 종류"
              value={kind}
              disabled={pending}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="note">메모 / 대화 기록</option>
              <option value="performance_review">성과 검토</option>
              <option value="review_adopted">채택한 방향</option>
            </select>
          </label>
          {kind !== "note" && (
            <label>
              다음 방향
              <input
                aria-label="다음 방향"
                value={direction}
                required={kind === "review_adopted"}
                disabled={pending}
                onChange={(event) => setDirection(event.target.value)}
              />
            </label>
          )}
          <label>
            새 기록
            <textarea
              aria-label="새 기록"
              required
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={pending}
            />
          </label>
          <label>
            근거 링크
            <input
              aria-label="근거 링크"
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              disabled={pending}
            />
          </label>
          <div className={styles.row}>
            <MuteButton
              type="submit"
              disabled={pending || !body.trim()}
              variant="dark"
            >
              기록 추가
            </MuteButton>
            {(body || evidence || direction) && (
              <MuteButton
                type="button"
                disabled={pending}
                onClick={() => {
                  setBody("");
                  setEvidence("");
                  setDirection("");
                }}
              >
                작성 취소
              </MuteButton>
            )}
          </div>
        </form>
      )}
      {history.error && (
        <div role="alert" className={styles.error}>
          {history.error.message}
        </div>
      )}
      {history.data?.rows.map((row) => (
        <article key={row.id} className={styles.historyItem}>
          <div>
            {activityLabels[String(row.kind)] ?? displayValue(row.kind)} ·{" "}
            {row.occurred_at
              ? new Date(String(row.occurred_at)).toLocaleString()
              : ""}{" "}
            · {displayValue(row.created_by)}
          </div>
          {row.payload &&
            typeof row.payload === "object" &&
            !Array.isArray(row.payload) &&
            row.payload.direction && (
              <div>방향: {displayValue(row.payload.direction)}</div>
            )}
          <p style={{ whiteSpace: "pre-wrap" }}>{displayValue(row.body)}</p>
          {row.source_ref && <div>근거: {displayValue(row.source_ref)}</div>}
        </article>
      ))}
      <div className={styles.row}>
        <span>
          {history.isFetching
            ? "불러오는 중…"
            : `${history.data?.total ?? 0}개 기록`}
        </span>
        <MuteButton
          disabled={pending || !offset || history.isFetching}
          onClick={() => setOffset(Math.max(0, offset - 30))}
        >
          이전
        </MuteButton>
        <MuteButton
          disabled={
            pending ||
            history.isFetching ||
            offset + 30 >= (history.data?.total ?? 0)
          }
          onClick={() => setOffset(offset + 30)}
        >
          다음
        </MuteButton>
      </div>
    </div>
  );
}
