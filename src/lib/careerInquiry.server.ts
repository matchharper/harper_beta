import { isTestTalentAccount } from "@/lib/testAccounts";
import { postUserFeedbackSlackMessage } from "@/lib/userFeedbackSlack";

type FeedbackTable = { from: (table: "feedback") => any };

function kstNow() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

/**
 * A Career user's message to the team: kept in `feedback` and posted to the user-feedback Slack channel.
 * Test accounts are saved but not posted.
 */
export async function saveCareerInquiry(args: {
  db: FeedbackTable;
  userId: string;
  source: string;
  title: string;
  fields: Array<[label: string, value: string]>;
  content: string;
}) {
  const savedContent = [
    `[${args.title}]`,
    `User ID: ${args.userId}`,
    ...args.fields.map(([label, value]) => `${label}: ${value}`),
    "",
    args.content,
  ].join("\n");
  const { data, error } = await args.db
    .from("feedback")
    .insert({ user_id: args.userId, content: savedContent, from: args.source })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(error?.message ?? "Failed to save inquiry");
  return { id: data.id as number };
}

export async function postCareerInquirySlack(args: {
  userId: string;
  title: string;
  fields: Array<[label: string, value: string]>;
  content: string;
}) {
  if (await isTestTalentAccount(args.userId)) return { posted: false as const };
  await postUserFeedbackSlackMessage({
    text: [
      `✉️ *${args.title}*`,
      "",
      `• *User ID*: ${args.userId}`,
      ...args.fields.map(([label, value]) => `• *${label}*: ${value}`),
      `• *Content*: ${args.content}`,
      `• *Time(Standard Korea Time)*: ${kstNow()}`,
    ].join("\n"),
  });
  return { posted: true as const };
}
