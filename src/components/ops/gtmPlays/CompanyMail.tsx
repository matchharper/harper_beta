import { cx, opsTheme } from "@/components/ops/theme";
import type { GtmMailLogRow } from "@/lib/gtmPlays/mailSend.server";
import { formatKstMinute } from "@/lib/gtmPlays/outreachFunnel";
import { isHarperMailAddress } from "@/lib/gtmPlays/personalMail";
import { formatKst } from "./api";
import { Badge } from "./ui";

const MAIL_STATUS_LABEL: Record<GtmMailLogRow["status"], string> = {
  sending: "보내는 중", sent: "보냄", failed: "실패", blocked: "안 보냄",
};
const CAMPAIGN_LABEL: Record<GtmMailLogRow["campaign"], string> = { pool: "회사 아웃바운드", demand: "회사 웨잇리스트", outreach: "후보자 아웃바운드" };
// From Resend after sending; a bounced or complaining address is not mailed again.
const DELIVERY_LABEL: Record<NonNullable<GtmMailLogRow["delivery_status"]>, string> = {
  bounced: "반송됨", complained: "스팸 신고", failed: "발송 실패",
};

/** The last sends to this address, company or Role, so a repeat is visible before pressing 보내기. */
export function SentHistory({ history }: { history: { rows: GtmMailLogRow[]; available: boolean } | null }) {
  if (!history) return null;
  if (!history.available) return <p className="text-[12px] text-neutral-muted">보낸 기록 테이블은 배포 때 만들어져요.</p>;
  if (!history.rows.length) return <p className="text-[12px] text-neutral-muted">보낸 기록 없음</p>;
  return (
    <ul className="space-y-1 text-[12px]">
      {history.rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums text-neutral-muted">{formatKst(row.created_at)}</span>
          <Badge tone={row.status === "sent" ? "positive" : row.status === "failed" ? "critical" : "default"}>{MAIL_STATUS_LABEL[row.status]}</Badge>
          <span>{row.to_email}</span>
          <span className="text-neutral-muted">· {CAMPAIGN_LABEL[row.campaign]} · {row.subject} · 보낸 사람 {row.from_email}</span>
          {row.claimed_at ? (
            <Badge tone="positive">{row.audience === "company" ? "가입해서 Role 받음" : "하퍼에서 열고 인박스에 넣음"}</Badge>
          ) : null}
          {row.delivery_status ? (
            <Badge tone="critical" title={row.delivery_detail ?? undefined}>{DELIVERY_LABEL[row.delivery_status]}</Badge>
          ) : null}
          {row.first_opened_at ? <Badge>클릭 {formatKstMinute(row.first_opened_at)}</Badge> : null}
          {row.error ? <span className="text-neutral-muted">· {row.error}</span> : null}
        </li>
      ))}
    </ul>
  );
}
