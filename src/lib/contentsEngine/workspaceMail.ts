import {
  dispatchApprovedOutreach,
  retryGtmReplyNotifications,
  syncGtmOutreachGmailHistory,
} from "./outreach";

export async function syncWorkspaceMail() {
  const remote = process.env.GTM_OUTREACH_REMOTE_SYNC_URL?.trim();
  // Local development can use the already connected inbox service without
  // exporting its production private key. The URL is server configuration only.
  if (remote && !process.env.GTM_OUTREACH_GMAIL_PRIVATE_KEY?.trim()) {
    const response = await fetch(remote, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
      signal: AbortSignal.timeout(240000),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true)
      throw new Error(result.error || "메일 동기화에 실패했습니다.");
    const notifications = await retryGtmReplyNotifications();
    if (notifications.some((item) => !item.ok))
      throw new Error(
        "메일은 수집했지만 Slack 알림에 실패했습니다. 다시 동기화하면 재시도합니다."
      );
    return { ok: true, sync: result.sync };
  }
  const sync = await syncGtmOutreachGmailHistory();
  if (sync.notifications.some((item) => !item.ok))
    throw new Error(
      "메일은 수집했지만 Slack 알림에 실패했습니다. 다시 동기화하면 재시도합니다."
    );
  return { ok: true, sync };
}

export async function deliverWorkspaceApproval(
  record: Record<string, unknown>,
  read: () => Promise<Record<string, unknown>>
) {
  if (
    record.status !== "approved" ||
    new Date(String(record.scheduled_at)).getTime() > Date.now()
  )
    return record;
  let deliveryError: string | undefined;
  try {
    const result = await dispatchApprovedOutreach({
      dispatchId: String(record.id),
      limit: 1,
    });
    deliveryError = result.find((item) => !item.ok)?.error;
  } catch {
    deliveryError =
      "승인은 저장됐지만 발송 결과를 확인하지 못했습니다. 발송 상태를 새로고침하세요.";
  }
  const current = await read();
  if (current.status === "failed" && !deliveryError)
    deliveryError = String(current.last_error || "메일 발송에 실패했습니다.");
  return {
    ...current,
    ...(deliveryError ? { delivery_error: deliveryError } : {}),
  };
}
