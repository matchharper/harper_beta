import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MuteButton } from "@/components/ui/button";
import { gtmRequest } from "@/lib/gtm/client";
import { displayValue } from "@/lib/gtm/grid";
import type { GtmRecordDetail, GtmRow, GtmValue } from "@/lib/gtm/types";
import RecordField from "./RecordField";
import styles from "./GtmWorkspace.module.css";
export function TrackingLinks({
  record,
  pending,
  canWrite,
  onSave,
  onDirtyChange,
}: {
  record: GtmRow;
  pending: boolean;
  canWrite: boolean;
  onSave: (values: Record<string, string>) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    onDirtyChange(Object.keys(draft).length > 0);
    return () => onDirtyChange(false);
  }, [draft, onDirtyChange]);
  const links = (
    Array.isArray(record.tracking_links) ? record.tracking_links : []
  ) as Record<string, GtmValue>[];
  return (
    <div className={styles.form}>
      {links.map((link, index) => (
        <div key={String(link.id)} className={styles.historyItem}>
          <label>
            {displayValue(link.placement) || `추적 링크 ${index + 1}`}
            <input
              aria-label={`추적 링크 ${index + 1}`}
              readOnly
              value={displayValue(link.url)}
            />
          </label>
          <MuteButton
            onClick={() => {
              void navigator.clipboard
                .writeText(String(link.url))
                .catch(() => setError("링크를 선택해 복사하세요."));
            }}
          >
            링크 복사
          </MuteButton>
        </div>
      ))}
      {!links.length && <div>발급된 추적 링크 없음</div>}
      {canWrite &&
        (record.plan_id && record.campaign_id ? (
          <form
            className={styles.form}
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await onSave({
                  destination_url: String(record.destination_url ?? ""),
                  scope: "content",
                  ...draft,
                })
              )
                setDraft({});
            }}
          >
            {[
              { key: "destination_url", label: "도착 URL", required: true },
              { key: "source", label: "유입 출처", required: true },
              { key: "medium", label: "매체", required: true },
              { key: "placement", label: "게시 위치" },
              {
                key: "scope",
                label: "귀속 대상",
                options: [
                  { value: "content", label: "이 콘텐츠" },
                  { value: "account", label: "플랫폼 계정" },
                  { value: "plan", label: "집행" },
                ],
              },
            ].map((field) => (
              <RecordField
                key={field.key}
                field={field}
                disabled={pending}
                value={
                  draft[field.key] ??
                  (field.key === "scope"
                    ? "content"
                    : field.key === "destination_url"
                      ? String(record.destination_url ?? "")
                      : "")
                }
                onChange={(value) => setDraft({ ...draft, [field.key]: value })}
              />
            ))}
            <div className={styles.row}>
              <MuteButton type="submit" variant="dark" disabled={pending}>
                추적 링크 발급
              </MuteButton>
              {Object.keys(draft).length > 0 && (
                <MuteButton
                  type="button"
                  disabled={pending}
                  onClick={() => setDraft({})}
                >
                  작성 취소
                </MuteButton>
              )}
            </div>
          </form>
        ) : (
          <div>
            기본 정보에서 집행과 캠페인을 연결하면 추적 링크를 발급할 수
            있습니다.
          </div>
        ))}
      {error && <div role="alert">{error}</div>}
    </div>
  );
}
export function OutreachDraft({
  account,
  record,
  pending,
  onSave,
  onDirtyChange,
}: {
  account: string;
  record: GtmRow;
  pending: boolean;
  onSave: (values: Record<string, string>) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    onDirtyChange(Object.keys(draft).length > 0);
    return () => onDirtyChange(false);
  }, [draft, onDirtyChange]);
  const contacts = (
    Array.isArray(record.contacts) ? record.contacts : []
  ) as Record<string, GtmValue>[];
  const emails = contacts.filter(
    (contact) =>
      String(contact.channel).toLowerCase() === "email" &&
      !["invalid", "bounced", "revoked"].includes(
        String(contact.status).toLowerCase()
      )
  );
  const template = useQuery({
    queryKey: ["ops-gtm", account, "draft-template", draft.template_id],
    queryFn: ({ signal }) =>
      gtmRequest<GtmRecordDetail>(
        "get_record",
        { source: "templates", record_id: draft.template_id },
        signal
      ),
    enabled: Boolean(draft.template_id),
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (record.do_not_contact)
    return <div>연락 금지로 표시된 크리에이터입니다.</div>;
  if (!emails.length)
    return <div>연락처에서 확인된 이메일을 먼저 등록하세요.</div>;
  return (
    <form
      className={styles.form}
      onSubmit={async (event) => {
        event.preventDefault();
        if (await onSave(draft)) setDraft({});
      }}
    >
      <div>초안을 준비한 뒤 발송본 검토에서 발송하거나 예약합니다.</div>
      <RecordField
        field={{
          key: "recipient_email",
          label: "수신자",
          required: true,
          options: emails.map((contact) => ({
            value: String(contact.address),
            label: String(contact.address),
          })),
        }}
        value={draft.recipient_email ?? ""}
        onChange={(value) => setDraft({ ...draft, recipient_email: value })}
        disabled={pending}
      />
      <RecordField
        field={{
          key: "template_id",
          label: "연락 템플릿",
          reference: "templates",
          required: true,
        }}
        value={draft.template_id ?? ""}
        onChange={(value) => setDraft({ ...draft, template_id: value })}
        disabled={pending}
      />
      {template.data && (
        <details>
          <summary>
            선택한 템플릿 · {displayValue(template.data.record.status)}
          </summary>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {[
              "subject_template",
              "opening_template",
              "value_proposition",
              "ask",
              "offer_structure",
            ]
              .map((key) => displayValue(template.data.record[key]))
              .filter(Boolean)
              .join("\n\n")}
          </p>
        </details>
      )}
      {template.error && <div role="alert">{template.error.message}</div>}
      {[
        { key: "subject", label: "최종 제목", required: true },
        { key: "body", label: "최종 본문", required: true },
        { key: "selection_reason", label: "템플릿 선택 이유", required: true },
        { key: "personalization_evidence", label: "개인화 근거" },
      ].map((field) => (
        <RecordField
          key={field.key}
          field={field}
          value={draft[field.key] ?? ""}
          onChange={(value) => setDraft({ ...draft, [field.key]: value })}
          disabled={pending}
        />
      ))}
      <div className={styles.row}>
        <MuteButton
          type="submit"
          variant="dark"
          disabled={
            pending ||
            !template.data ||
            template.data.record.status !== "active" ||
            template.data.record.channel !== "email"
          }
        >
          발송 검토로 보내기
        </MuteButton>
        <MuteButton
          type="button"
          disabled={pending}
          onClick={() => setDraft({})}
        >
          작성 취소
        </MuteButton>
      </div>
    </form>
  );
}
