import { createHash } from "node:crypto";

/** Only transport data belongs here; conversation policy stays in the Career agent. */
export function googleMeetUrl(value: string): string {
  const url = new URL(value);
  if (url.origin !== "https://meet.google.com" || !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname)) {
    throw new Error("Expected a Google Meet room URL");
  }
  return `${url.origin}${url.pathname}`;
}

export function recallBotBody(meetingUrl: string, outputUrl: string, googleLoginGroup?: string) {
  const output = new URL(outputUrl);
  if (output.protocol !== "https:" || output.username || output.password) throw new Error("Output media requires HTTPS");
  return {
    meeting_url: googleMeetUrl(meetingUrl),
    bot_name: "Harper",
    output_media: { camera: { kind: "webpage", config: { url: output.href } } },
    // Raw audio is handled by the output page. Do not request saved recordings or ASR.
    recording_config: null,
    ...(googleLoginGroup ? { google_meet: { google_login_group_id: googleLoginGroup } } : {}),
  };
}

export function calendarInvitation(args: { runId: string; email: string; startAt: Date; durationMinutes: number; timeZone: string }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email) || !Number.isFinite(args.startAt.getTime()) || !Number.isInteger(args.durationMinutes) || args.durationMinutes < 1 || args.durationMinutes > 60) throw new Error("Invalid invitation");
  new Intl.DateTimeFormat("en", { timeZone: args.timeZone }).format(args.startAt);
  // The same run ID can safely recover the Calendar event after a lost response.
  const id = createHash("sha256").update(`harper-meet:${args.runId}`).digest("hex");
  return {
    id, summary: "Harper",
    description: "Harper AI와의 음성 대화입니다. 대화는 Harper 통화 기록에 저장되며, 음성 연결에 Recall.ai와 OpenAI를 사용합니다.",
    start: { dateTime: args.startAt.toISOString(), timeZone: args.timeZone },
    end: { dateTime: new Date(args.startAt.getTime() + args.durationMinutes * 60_000).toISOString(), timeZone: args.timeZone },
    attendees: [{ email: args.email }],
    guestsCanInviteOthers: false, guestsCanModify: false,
    conferenceData: { createRequest: { requestId: id, conferenceSolutionKey: { type: "hangoutsMeet" } } },
  };
}

export class RecallMeetClient {
  private base: string;
  constructor(private key: string, region: string, private request: typeof fetch = fetch) {
    if (!["us-east-1", "us-west-2", "eu-central-1", "ap-northeast-1"].includes(region)) throw new Error("Unsupported Recall region");
    this.base = `https://${region}.recall.ai/api/v1`;
  }
  private async post(path: string, body?: unknown) {
    const response = await this.request(`${this.base}${path}`, {
      method: "POST", headers: { Authorization: `Token ${this.key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    // Never automatically retry create: a timeout can mean the bot already exists.
    if (!response.ok) throw new Error(`Recall request failed (${response.status}); inspect the Recall dashboard before retrying`);
    return response;
  }
  async create(body: ReturnType<typeof recallBotBody>): Promise<string> {
    const payload = await (await this.post("/bot/", body)).json();
    if (typeof payload.id !== "string" || !/^[a-zA-Z0-9-]+$/.test(payload.id)) throw new Error("Recall returned no bot ID; inspect dashboard before retrying");
    return payload.id;
  }
  async leave(botId: string) {
    const path = `/bot/${encodeURIComponent(botId)}/`;
    try { await this.post(`${path}leave_call/`); }
    catch (error) {
      // The bot can leave automatically before our media connection closes.
      // Confirm a terminal provider state instead of masking an actual failure.
      const response = await this.request(`${this.base}${path}`, {
        headers: { Authorization: `Token ${this.key}` }, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw error;
      const bot = await response.json();
      const last = Array.isArray(bot.status_changes) ? bot.status_changes.at(-1)?.code : undefined;
      if (last !== "done" && last !== "fatal") throw error;
    }
  }
}
