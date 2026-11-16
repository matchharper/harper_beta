import { useCallback, useEffect, useState } from "react";
import { cx } from "@/components/ops/theme";
import { gtmBatchOverLimit, type GtmSendQuota } from "@/lib/gtmPlays/sendLimit";
import { fetchGtmSendQuota } from "./api";

/** The signed-in sender's GTM mails today against the daily limit; reload after sending. */
export function useGtmSendQuota() {
  const [quota, setQuota] = useState<GtmSendQuota | null>(null);
  const reload = useCallback(() => {
    fetchGtmSendQuota().then(setQuota).catch(() => setQuota(null));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { quota, reload };
}

/** "오늘 12/50통", next to a send button. */
export function SendQuotaCount({ quota }: { quota: GtmSendQuota | null }) {
  if (!quota) return null;
  return (
    <span
      className={cx("text-[12px] tabular-nums", quota.left ? "text-neutral-muted" : "text-critical")}
      title="로그인한 내 계정이 오늘(한국 시간) 보낸 GTM 메일이에요. 회사·후보 메일을 모두 세고, @matchharper.com 테스트 메일은 안 세요."
    >
      오늘 {quota.sentToday}/{quota.limit}통
    </span>
  );
}

/**
 * Before sending `counted` mails (not to matchharper.com): what the limit leaves out, in words; null when all of
 * them go. `none` is true when none of them would go.
 */
export function sendQuotaWarning(quota: GtmSendQuota | null, counted: number) {
  if (!quota || counted <= 0) return null;
  const { willSend, refused } = gtmBatchOverLimit(quota, counted);
  if (!refused) return null;
  return {
    none: willSend === 0,
    text: willSend === 0
      ? `오늘 보낼 수 있는 메일 수(${quota.limit}통)를 다 썼어요`
      : `오늘 ${quota.left}통 남아서 ${counted}명 중 ${refused}명은 안 보내져요`,
  };
}
