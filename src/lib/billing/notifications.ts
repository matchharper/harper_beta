import { IncomingWebhook } from "@slack/webhook";
import type { BillingPeriod } from "@/lib/billing/common";

type BillingSuccessKind =
  | "subscription_purchase"
  | "subscription_recovery"
  | "subscription_renewal"
  | "subscription_retry"
  | "subscription_plan_change"
  | "one_time_payment";

type BillingSuccessNotificationArgs = {
  kind: BillingSuccessKind;
  userId: string;
  userEmail?: string | null;
  userName?: string | null;
  planName: string;
  billing?: BillingPeriod | null;
  amountKRW: number;
  approvedAt?: string | null;
  orderId?: string | null;
  paymentKey?: string | null;
  note?: string | null;
};

function getSlackWebhook() {
  const webhookUrl = process.env.SLACK_TOKEN?.trim();
  if (!webhookUrl) {
    throw new Error("SLACK_TOKEN is not configured");
  }

  return new IncomingWebhook(webhookUrl);
}

function formatEventLabel(kind: BillingSuccessKind) {
  if (kind === "subscription_purchase") return "신규 구독 결제";
  if (kind === "subscription_recovery") return "미납 구독 복구 결제";
  if (kind === "subscription_renewal") return "정기 갱신 결제";
  if (kind === "subscription_retry") return "재시도 결제 성공";
  if (kind === "subscription_plan_change") return "플랜 변경 결제";
  return "일회성 결제";
}

function formatBillingLabel(billing?: BillingPeriod | null) {
  if (billing === "monthly") return "월간";
  if (billing === "yearly") return "연간";
  return "-";
}

function formatKrw(amountKRW: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amountKRW);
}

function formatKst(value?: string | null) {
  const fallback = new Date();
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) {
    return value ?? fallback.toISOString();
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export async function notifyBillingPaymentSucceeded(
  args: BillingSuccessNotificationArgs
) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") {
    return;
  }

  const webhook = getSlackWebhook();
  const userLabel = args.userName?.trim() || "이름 없음";
  const emailLabel = args.userEmail?.trim() || "이메일 없음";
  const note = args.note?.trim();

  const lines = [
    `💸 *${formatEventLabel(args.kind)}*`,
    `• *User*: ${userLabel}`,
    `• *Email*: ${emailLabel}`,
    `• *User ID*: ${args.userId}`,
    `• *Plan*: ${args.planName}`,
    `• *Billing*: ${formatBillingLabel(args.billing)}`,
    `• *Amount*: ${formatKrw(args.amountKRW)}`,
    `• *Approved At (KST)*: ${formatKst(args.approvedAt)}`,
  ];

  if (args.orderId) {
    lines.push(`• *Order ID*: ${args.orderId}`);
  }

  if (args.paymentKey) {
    lines.push(`• *Payment Key*: ${args.paymentKey}`);
  }

  if (note) {
    lines.push(`• *Note*: ${note}`);
  }

  await webhook.send({
    text: `${formatEventLabel(args.kind)}: ${emailLabel} / ${args.planName}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: lines.join("\n"),
        },
      },
    ],
  });
}
