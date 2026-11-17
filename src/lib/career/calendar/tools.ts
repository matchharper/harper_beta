import { z } from "zod";
import { createHash } from "node:crypto";
import { createComposioClient } from "@/lib/integrations/composio";
import { GoogleCalendarError } from "@/lib/integrations/googleCalendarError";
import { careerCalendarService } from "./connection";
import {
  effectReferenceProperties,
  reserveWorkEffect,
  readBoundEffect,
  bindWorkEffect,
  CareerEffectWaiting,
} from "../externalOperations/effects";
import {
  createOperation,
  readOperation,
  updateOperation,
  assertExternalToolActive,
  type ExternalToolContext,
} from "../externalOperations/store";
import {
  record,
  text,
  resourceRefSchema,
  type ResourceContext,
} from "../resources/types";
import { resourceAvailable } from "../resources/read";
import { refsInput } from "../resources/toolSchemas";

const connectionRequired = (error: unknown) => {
  if (
    error instanceof GoogleCalendarError &&
    ["NOT_CONNECTED", "AUTH_EXPIRED"].includes(error.code)
  )
    return {
      status: "connection_required",
      modelOutput:
        "Google Calendar is not connected; no calendar was read or changed. Connection: /career/profile?profileSection=links . Gmail permission does not grant Calendar access.",
    };
  throw error;
};
const readSchema = z
  .object({
    action: z.enum(["list_calendars", "events", "event", "busy", "receipt"]),
    operation_id: z.string().uuid().optional(),
    calendar_id: z.string().default("primary"),
    calendar_ids: z.array(z.string()).optional(),
    event_id: z.string().optional(),
    time_min: z.string().datetime({ offset: true }).optional(),
    time_max: z.string().datetime({ offset: true }).optional(),
    page_token: z.string().optional(),
    timezone: z.string().optional(),
  })
  .strict();
export const READ_CALENDAR_TOOL = {
  name: "read_calendar",
  description:
    "Read the user's separately connected Google Calendar: calendars, an event with its etag, a time window of events, or busy intervals. action=receipt with operation_id reconciles an existing write against the exact provider event, without repeating it. Pages and per-calendar errors are explicit; incomplete reads do not establish availability. Times must include an offset. This tool makes no reservation.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: readSchema.shape.action.options },
      calendar_id: { type: "string" },
      calendar_ids: { type: "array", items: { type: "string" } },
      operation_id: { type: "string" },
      event_id: { type: "string" },
      time_min: { type: "string" },
      time_max: { type: "string" },
      page_token: { type: "string" },
      timezone: { type: "string" },
    },
    required: ["action"],
    additionalProperties: false,
  },
};
export async function executeReadCalendar(
  raw: unknown,
  context: ResourceContext
) {
  const input = readSchema.parse(raw),
    service = careerCalendarService(context.admin);
  let accountId: string;
  try {
    accountId = await service.requireActiveAccountId(context.userId);
  } catch (error) {
    return connectionRequired(error);
  }
  if (input.action === "receipt") {
    if (!input.operation_id)
      throw new Error(
        "An operation_id is required to inspect a write receipt."
      );
    let operation = await readOperation(context, input.operation_id);
    if (
      !operation ||
      operation.kind !== "calendar_write" ||
      operation.request.account_id !== accountId
    )
      throw new Error(
        "Calendar receipt is not available for this connected account."
      );
    const eventId = text(operation.request.event_id),
      calendarId = text(operation.request.calendar_id) || "primary";
    const result = await createComposioClient().calendarRequest({
      accountId,
      userId: context.userId,
      path: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      method: "GET",
    });
    if ((await service.requireActiveAccountId(context.userId)) !== accountId)
      throw new Error("Calendar connection changed during receipt read.");
    const data = record(result.data),
      expectedEffect = operation.request.effect_id ?? operation.id;
    const confirmed =
      operation.request.action === "cancel"
        ? result.status === 404 ||
          result.status === 410 ||
          data.status === "cancelled"
        : result.status === 200 &&
          record(record(data.extendedProperties).private).harperEffectId ===
            expectedEffect;
    if (confirmed && ["uncertain", "dispatching"].includes(operation.status))
      operation = await updateOperation(context, operation, {
        status: "succeeded",
        provider_refs: {
          ...operation.provider_refs,
          etag: data.etag ?? null,
          reconciled_http_status: result.status,
        },
        result: {
          ...operation.result,
          summary:
            operation.request.action === "cancel"
              ? "The exact calendar event is absent or cancelled. The actor and notification delivery are not established by this read."
              : "The exact calendar event contains this operation's effect identity.",
          event: data,
          verified_at: new Date().toISOString(),
        },
      });
    return {
      status: operation.status,
      operation,
      modelOutput: JSON.stringify({
        status: operation.status,
        operationId: operation.id,
        confirmed,
        event: data,
        providerStatus: result.status,
        receipt: operation.provider_refs,
      }),
    };
  }
  let path: string, body: Record<string, unknown> | undefined;
  const query = new URLSearchParams();
  if (input.page_token) query.set("pageToken", input.page_token);
  if (input.timezone) query.set("timeZone", input.timezone);
  if (input.action === "list_calendars")
    path = "/calendar/v3/users/me/calendarList";
  else if (input.action === "event") {
    if (!input.event_id) throw new Error("An exact event_id is required.");
    path = `/calendar/v3/calendars/${encodeURIComponent(input.calendar_id)}/events/${encodeURIComponent(input.event_id)}`;
  } else {
    if (
      !input.time_min ||
      !input.time_max ||
      Date.parse(input.time_min) >= Date.parse(input.time_max)
    )
      throw new Error("A valid Calendar time window is required.");
    if (input.action === "busy") {
      path = "/calendar/v3/freeBusy";
      body = {
        timeMin: input.time_min,
        timeMax: input.time_max,
        timeZone: input.timezone,
        items: (input.calendar_ids ?? [input.calendar_id]).map((id) => ({
          id,
        })),
      };
    } else {
      path = `/calendar/v3/calendars/${encodeURIComponent(input.calendar_id)}/events`;
      query.set("timeMin", input.time_min);
      query.set("timeMax", input.time_max);
      query.set("singleEvents", "true");
      query.set("orderBy", "startTime");
    }
  }
  if (query.size) path += `?${query}`;
  const result = await createComposioClient().calendarRequest({
    accountId,
    userId: context.userId,
    path,
    method: body ? "POST" : "GET",
    body,
  });
  if ((await service.requireActiveAccountId(context.userId)) !== accountId)
    throw new Error("Calendar connection changed during read.");
  const data = record(result.data),
    errors =
      input.action === "busy"
        ? Object.values(record(data.calendars)).some(
            (calendar) =>
              Array.isArray(record(calendar).errors) &&
              Boolean((record(calendar).errors as unknown[]).length)
          )
        : false;
  return {
    status: result.status >= 200 && result.status < 300 ? "read" : "failed",
    accountId,
    calendarId: input.calendar_id,
    data,
    modelOutput: JSON.stringify({
      providerStatus: result.status,
      accountId,
      calendarId: input.calendar_id,
      data,
      complete:
        result.status >= 200 &&
        result.status < 300 &&
        !data.nextPageToken &&
        !errors,
    }),
  };
}
const writeSchema = z
  .object({
    action: z.enum(["create", "update", "cancel"]),
    calendar_id: z.string().default("primary"),
    event_id: z.string().optional(),
    etag: z.string().optional(),
    event: z.record(z.unknown()).optional(),
    send_updates: z.enum(["all", "externalOnly", "none"]),
    effect_key: z.string(),
    source_refs: z.array(resourceRefSchema).default([]),
    responsibility_ref: z
      .object({ id: z.string().uuid(), revision: z.number().int().positive() })
      .optional(),
    opportunity_id: z.string().uuid().optional(),
    effect_ref: z.string().uuid().optional(),
  })
  .strict();
export const WRITE_CALENDAR_TOOL = {
  name: "write_calendar",
  description:
    "Create, update or cancel an authorized Google Calendar event. Use source_refs for the agreed details and existing effect/responsibility references. Calendar changes can notify attendees; choose send_updates explicitly according to the request. Update/cancel requires the etag from a current read and fails on concurrent edits. event is Google Calendar Events JSON (start/end with offsets and timezone, attendees, summary, description, location, etc.). Create uses a stable provider event ID. A provider acceptance is distinct from the counterpart agreeing to the meeting.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: writeSchema.shape.action.options },
      calendar_id: { type: "string" },
      event_id: { type: "string" },
      etag: { type: "string" },
      event: { type: "object" },
      send_updates: { type: "string", enum: ["all", "externalOnly", "none"] },
      effect_key: { type: "string" },
      source_refs: refsInput,
      ...effectReferenceProperties,
    },
    required: ["action", "effect_key", "send_updates"],
    additionalProperties: false,
  },
};
export async function executeWriteCalendar(
  raw: unknown,
  context: ExternalToolContext
) {
  const input = writeSchema.parse(raw),
    service = careerCalendarService(context.admin),
    provider = createComposioClient();
  const effect = await reserveWorkEffect(context, input.effect_key, input),
    bound = await readBoundEffect(context, effect);
  if (bound)
    return {
      status: bound.status,
      operation: bound,
      modelOutput: `This effect is already ${bound.kind} ${bound.id}: ${bound.status}. Receipt: ${JSON.stringify(bound.provider_refs)}. Read the provider event before any further change; no action was repeated.`,
    };
  let accountId: string;
  try {
    accountId = await service.requireActiveAccountId(context.userId);
  } catch (error) {
    return connectionRequired(error);
  }
  for (const ref of input.source_refs)
    if (!(await resourceAvailable(context, ref)))
      throw new Error("Calendar source unavailable.");
  if (input.action !== "create" && (!input.event_id || !input.etag))
    throw new Error("Read the current event_id and etag before changing it.");
  if (input.action === "create" && (!input.event?.start || !input.event?.end))
    throw new Error("Calendar creation requires start and end boundaries.");
  const eventId =
    input.action === "create"
      ? createHash("sha256")
          .update(effect?.id ?? `${context.userId}:${input.effect_key}`)
          .digest("hex")
      : input.event_id!;
  const base = `/calendar/v3/calendars/${encodeURIComponent(input.calendar_id)}/events`,
    exact = `${base}/${encodeURIComponent(eventId)}`;
  let previous: Record<string, unknown> = {};
  if (input.action !== "create") {
    const read = await provider.calendarRequest({
      accountId,
      userId: context.userId,
      path: exact,
      method: "GET",
    });
    previous = record(read.data);
    if (read.status !== 200 || previous.etag !== input.etag)
      throw new Error(
        "Calendar event changed or is unavailable. Read its current version before editing."
      );
  }
  let operation = await createOperation(context, {
    kind: "calendar_write",
    idempotencyKey: context.requestId,
    request: {
      ...input,
      account_id: accountId,
      event_id: eventId,
      effect_id: effect?.id ?? null,
      previous,
    },
  });
  if (operation.status !== "reserved")
    return {
      operation,
      status: operation.status,
      modelOutput: JSON.stringify({
        status: operation.status,
        receipt: operation.provider_refs,
      }),
    };
  try {
    if ((await service.requireActiveAccountId(context.userId)) !== accountId)
      throw new Error("Calendar connection changed before dispatch.");
    await assertExternalToolActive(context);
    await bindWorkEffect(context, effect, operation);
    operation = await updateOperation(context, operation, {
      status: "dispatching",
      provider_refs: {
        account_id: accountId,
        calendar_id: input.calendar_id,
        event_id: eventId,
        previous_etag: input.etag ?? null,
      },
    });
    const body =
      input.action === "cancel"
        ? undefined
        : {
            ...input.event,
            ...(input.action === "create" ? { id: eventId } : {}),
            extendedProperties: {
              ...record(previous.extendedProperties),
              ...record(input.event?.extendedProperties),
              private: {
                ...record(record(previous.extendedProperties).private),
                ...record(record(input.event?.extendedProperties).private),
                harperEffectId: effect?.id ?? operation.id,
              },
            },
          };
    const result = await provider.calendarRequest({
      accountId,
      userId: context.userId,
      path: `${input.action === "create" ? base : exact}?sendUpdates=${input.send_updates}&conferenceDataVersion=1`,
      method:
        input.action === "create"
          ? "POST"
          : input.action === "cancel"
            ? "DELETE"
            : "PATCH",
      body,
      etag: input.etag,
    });
    const data = record(result.data),
      accepted = result.status >= 200 && result.status < 300;
    operation = await updateOperation(context, operation, {
      status: accepted
        ? "succeeded"
        : result.status >= 500
          ? "uncertain"
          : "failed",
      provider_refs: {
        ...operation.provider_refs,
        etag: data.etag ?? null,
        http_status: result.status,
      },
      result: {
        summary: accepted
          ? `Google Calendar accepted ${input.action}.`
          : `Google Calendar returned ${result.status}; the requested change is not confirmed.`,
        event: accepted ? data : null,
        accepted_at: accepted ? new Date().toISOString() : null,
      },
    });
  } catch (error) {
    if (error instanceof CareerEffectWaiting) throw error;
    operation = await updateOperation(context, operation, {
      status: operation.status === "dispatching" ? "uncertain" : "failed",
      result: {
        summary:
          "Calendar change is not confirmed. Inspect the exact event and receipt before another action.",
        error: String(error),
      },
    });
  }
  return {
    operation,
    status: operation.status,
    modelOutput: JSON.stringify({
      status: operation.status,
      receiptId: operation.id,
      receipt: operation.provider_refs,
      result: operation.result,
    }),
  };
}
