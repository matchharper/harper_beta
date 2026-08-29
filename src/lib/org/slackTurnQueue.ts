import "server-only";

import { send } from "@vercel/queue";
import {
  compactHarperSlackFilesForQueue,
  parseQueuedHarperSlackFiles,
  type HarperSlackFile,
} from "@/lib/org/slackFiles";
import type { SlackEventEnvelope } from "@/lib/org/slackHarperEvents";

export const HARPER_SLACK_TURN_QUEUE_TOPIC = "harper-slack-turn-v1";
export const HARPER_SLACK_TURN_QUEUE_RETENTION_SECONDS = 86_400;

type SlackTurnQueueEvent = {
  apiAppId?: string;
  event?: {
    botId?: string;
    channel?: string;
    eventTs?: string;
    files?: HarperSlackFile[];
    subtype?: string;
    text?: string;
    threadTs?: string;
    ts?: string;
    type?: string;
    user?: string;
  };
  eventId?: string;
  teamId?: string;
};

export type HarperSlackTurnQueueMessage =
  | {
      event: SlackTurnQueueEvent;
      kind: "event";
      version: 1;
    }
  | {
      jobId: string;
      kind: "reply_job";
      source: "interactivity" | "role_creation_bootstrap" | "recovery";
      version: 1;
    };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function optional(value: unknown, limit = 12_000) {
  const normalized = clean(value).slice(0, limit);
  return normalized || undefined;
}

export function toHarperSlackEventQueueMessage(
  envelope: SlackEventEnvelope
): HarperSlackTurnQueueMessage {
  const event = envelope.event;
  return {
    event: {
      apiAppId: optional(envelope.api_app_id, 100),
      event: event
        ? {
            botId: optional(event.bot_id, 100),
            channel: optional(event.channel, 100),
            eventTs: optional(event.event_ts, 100),
            files: compactHarperSlackFilesForQueue(event.files),
            subtype: optional(event.subtype, 100),
            text: optional(event.text),
            threadTs: optional(event.thread_ts, 100),
            ts: optional(event.ts, 100),
            type: optional(event.type, 100),
            user: optional(event.user, 100),
          }
        : undefined,
      eventId: optional(envelope.event_id, 200),
      teamId: optional(envelope.team_id, 100),
    },
    kind: "event",
    version: 1,
  };
}

export function fromHarperSlackEventQueueMessage(
  message: Extract<HarperSlackTurnQueueMessage, { kind: "event" }>
): SlackEventEnvelope {
  const event = message.event.event;
  return {
    api_app_id: message.event.apiAppId,
    event: event
      ? {
          bot_id: event.botId,
          channel: event.channel,
          event_ts: event.eventTs,
          files: parseQueuedHarperSlackFiles(event.files),
          subtype: event.subtype,
          text: event.text,
          thread_ts: event.threadTs,
          ts: event.ts,
          type: event.type,
          user: event.user,
        }
      : undefined,
    event_id: message.event.eventId,
    team_id: message.event.teamId,
  };
}

export function parseHarperSlackTurnQueueMessage(
  value: unknown
): HarperSlackTurnQueueMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (message.version !== 1) return null;

  if (message.kind === "reply_job") {
    const jobId = clean(message.jobId);
    const source = clean(message.source);
    if (
      !jobId ||
      !["interactivity", "role_creation_bootstrap", "recovery"].includes(source)
    ) {
      return null;
    }
    return {
      jobId,
      kind: "reply_job",
      source: source as Extract<
        HarperSlackTurnQueueMessage,
        { kind: "reply_job" }
      >["source"],
      version: 1,
    };
  }

  if (message.kind !== "event") return null;
  const queueEvent = message.event;
  if (!queueEvent || typeof queueEvent !== "object" || Array.isArray(queueEvent)) {
    return null;
  }
  const eventEnvelope = queueEvent as Record<string, unknown>;
  const eventId = optional(eventEnvelope.eventId, 200);
  const teamId = optional(eventEnvelope.teamId, 100);
  const apiAppId = optional(eventEnvelope.apiAppId, 100);
  const rawEvent = eventEnvelope.event;
  if (
    !eventId ||
    !teamId ||
    !apiAppId ||
    !rawEvent ||
    typeof rawEvent !== "object" ||
    Array.isArray(rawEvent)
  ) {
    return null;
  }
  const event = rawEvent as Record<string, unknown>;
  return {
    event: {
      apiAppId,
      event: {
        botId: optional(event.botId, 100),
        channel: optional(event.channel, 100),
        eventTs: optional(event.eventTs, 100),
        files: compactHarperSlackFilesForQueue(
          parseQueuedHarperSlackFiles(event.files)
        ),
        subtype: optional(event.subtype, 100),
        text: optional(event.text),
        threadTs: optional(event.threadTs, 100),
        ts: optional(event.ts, 100),
        type: optional(event.type, 100),
        user: optional(event.user, 100),
      },
      eventId,
      teamId,
    },
    kind: "event",
    version: 1,
  };
}

export async function publishHarperSlackEvent(
  envelope: SlackEventEnvelope
) {
  const eventId = clean(envelope.event_id);
  if (!eventId) throw new Error("Slack event id is required for Queue publish");
  return send(
    HARPER_SLACK_TURN_QUEUE_TOPIC,
    toHarperSlackEventQueueMessage(envelope),
    {
      idempotencyKey: `slack-event:${eventId}`,
      retentionSeconds: HARPER_SLACK_TURN_QUEUE_RETENTION_SECONDS,
    }
  );
}

export async function publishHarperSlackReplyJob(args: {
  jobId: string;
  source: Extract<
    HarperSlackTurnQueueMessage,
    { kind: "reply_job" }
  >["source"];
}) {
  const jobId = clean(args.jobId);
  if (!jobId) throw new Error("Slack reply job id is required for Queue publish");
  return send(
    HARPER_SLACK_TURN_QUEUE_TOPIC,
    {
      jobId,
      kind: "reply_job",
      source: args.source,
      version: 1,
    } satisfies HarperSlackTurnQueueMessage,
    {
      idempotencyKey: `slack-reply-job:${jobId}`,
      retentionSeconds: HARPER_SLACK_TURN_QUEUE_RETENTION_SECONDS,
    }
  );
}
